// Normalización de imágenes de catálogo con IA (Gemini) para el Portal de Aliados Comerciales.
// POST /api/comercios/normalizar-imagen — multipart/form-data con el campo "imagen" (PNG/JPG/WEBP) y el header
// Authorization: Bearer <iac_store>. Responde 200 con los bytes de la imagen rediseñada en cuadrado 512x512, o
// un JSON { code: 0, error, message } con el motivo si no pudo (el portal entonces encaja la imagen sin IA).
//
// Es código de servidor a propósito: GEMINI_API_KEY solo existe en el entorno del servidor (sin prefijo
// NEXT_PUBLIC_), así que nunca viaja al navegador de los comercios.
//
// Contrato de Gemini tomado de la documentación oficial el 2026-10-02 (ai.google.dev/api/generate-content y
// /gemini-api/docs/generate-content/image-generation). NO se ha probado contra el servicio real: el repositorio
// no trae ninguna API key. gemini-3.1-flash-image entrega 512x512 nativo (imageSize "512" con aspectRatio "1:1")
// y no tiene capa gratuita: la key necesita facturación activa. Si Google retira el modelo, se cambia con
// GEMINI_IMAGE_MODEL sin tocar código.

export const maxDuration = 60;

const ADONIS_BASE = "https://dev.carjos-marketplace.cloud";
const ADONIS_API_KEY = process.env.NEXT_PUBLIC_SERVER_API_KEY || "bf8f1b64-6342-48c5-af05-501e4c15a6cb";

const GEMINI_MODELO = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELO}:generateContent`;
// Sesión (8 s) + Gemini (45 s) caben dentro de maxDuration
const ESPERA_SESION_MS = 8000;
const ESPERA_GEMINI_MS = 45000;

const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/webp"];
// El portal envía una copia reducida (lado mayor <= 1024 px, unos cientos de KB): este tope solo acota el costo
const MAX_BYTES = 4 * 1024 * 1024;

// En inglés: es el idioma con el que el modelo rinde mejor según su documentación
const INSTRUCCION = [
  "Recompose this image into a perfectly square 1:1 product-catalog image.",
  "Keep every original element exactly as it appears: the product, its packaging, labels, logos and any text, with the same wording, spelling, numbers, colors and proportions.",
  "If the original is wider or taller than a square, rearrange the layout and extend the existing background naturally so the whole composition fits the square, centered, with balanced margins and nothing cropped, stretched or distorted.",
  "If it is a graphic design such as a flyer, banner or promotional artwork, re-lay out its elements for the square format, keeping all of its text legible and unchanged.",
  "Introduce no new objects, text, borders or watermarks. Return only the final image.",
].join(" ");

// `message` va en minúscula y sin punto final: el portal lo muestra a continuación de "sin rediseño de IA: "
function responderError(status, error, message) {
  return Response.json({ code: 0, error, message }, { status });
}

// Solo un comercio con sesión viva puede gastar cuota de IA: se valida el Bearer contra GET /user/login, el
// mismo contrato que usa loginComercio (src/lib/commerceServices.js). Un 5xx de Adonis no es "sesión inválida".
async function sesionComercioValida(token) {
  const res = await fetch(`${ADONIS_BASE}/user/login`, {
    headers: { apiKey: ADONIS_API_KEY, Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(ESPERA_SESION_MS),
  });
  if (res.status >= 500) throw new Error(`Adonis respondió HTTP ${res.status}`);
  let datos = null;
  try {
    datos = await res.json();
  } catch (e) {
    datos = null;
  }
  return res.ok && datos?.code === 1;
}

async function redisenarConGemini(clave, imagen) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "x-goog-api-key": clave, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: INSTRUCCION },
            { inline_data: { mime_type: imagen.type, data: Buffer.from(await imagen.arrayBuffer()).toString("base64") } },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "1:1", imageSize: "512" },
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(ESPERA_GEMINI_MS),
  });

  let datos = null;
  try {
    datos = await res.json();
  } catch (e) {
    datos = null;
  }

  // El detalle de Google se queda en el log del servidor; al navegador solo viaja el estado (p. ej. PERMISSION_DENIED)
  if (!res.ok) {
    console.error(`[normalizar-imagen] Gemini respondió HTTP ${res.status}: ${datos?.error?.message || "sin detalle"}`);
    if (res.status === 429) {
      return responderError(429, "IA_SIN_CUOTA", "la IA alcanzó su límite de uso, intenta de nuevo en unos minutos");
    }
    return responderError(502, "IA_RECHAZO", `el servicio de IA rechazó la solicitud (${datos?.error?.status || `HTTP ${res.status}`})`);
  }

  const bloqueo = datos?.promptFeedback?.blockReason;
  if (bloqueo) {
    return responderError(422, "IA_BLOQUEO", `la IA no aceptó esta imagen (${bloqueo})`);
  }

  // La respuesta puede traer imágenes intermedias marcadas como "thought": la definitiva es la última que no lo es
  const candidato = datos?.candidates?.[0];
  const partes = Array.isArray(candidato?.content?.parts) ? candidato.content.parts : [];
  const generada = partes
    .filter((p) => !p?.thought)
    .map((p) => p?.inlineData || p?.inline_data)
    .filter((b) => b?.data)
    .pop();
  if (!generada) {
    console.error(`[normalizar-imagen] Gemini no devolvió imagen (finishReason: ${candidato?.finishReason || "desconocido"})`);
    return responderError(502, "IA_SIN_IMAGEN", `la IA no devolvió una imagen (${candidato?.finishReason || "sin motivo"})`);
  }

  return new Response(Buffer.from(generada.data, "base64"), {
    status: 200,
    headers: { "Content-Type": generada.mimeType || generada.mime_type || "image/png", "Cache-Control": "no-store" },
  });
}

export async function POST(request) {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) {
    return responderError(503, "IA_NO_CONFIGURADA", "el servicio de IA aún no está configurado");
  }

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return responderError(401, "SESION_REQUERIDA", "falta la sesión del comercio");
  }
  try {
    if (!(await sesionComercioValida(token))) {
      return responderError(401, "SESION_INVALIDA", "la sesión del comercio no es válida o venció");
    }
  } catch (e) {
    console.error(`[normalizar-imagen] No se pudo validar la sesión contra Adonis: ${e?.message}`);
    return responderError(503, "SESION_NO_VERIFICADA", "no se pudo verificar la sesión del comercio");
  }

  let imagen = null;
  try {
    imagen = (await request.formData()).get("imagen");
  } catch (e) {
    imagen = null;
  }
  if (!imagen || typeof imagen === "string") {
    return responderError(400, "IMAGEN_REQUERIDA", "no se recibió ninguna imagen");
  }
  if (!TIPOS_PERMITIDOS.includes(imagen.type)) {
    return responderError(415, "FORMATO_NO_PERMITIDO", "formato no permitido, usa PNG, JPG o WEBP");
  }
  if (!imagen.size || imagen.size > MAX_BYTES) {
    return responderError(413, "IMAGEN_MUY_PESADA", "la imagen es demasiado pesada para rediseñarla con IA");
  }

  try {
    return await redisenarConGemini(clave, imagen);
  } catch (e) {
    const sinRespuesta = e?.name === "TimeoutError" || e?.name === "AbortError";
    console.error(`[normalizar-imagen] ${sinRespuesta ? "Gemini no respondió a tiempo" : `Fallo al llamar a Gemini: ${e?.message}`}`);
    return sinRespuesta
      ? responderError(504, "IA_SIN_RESPUESTA", "la IA tardó demasiado en responder")
      : responderError(502, "IA_NO_DISPONIBLE", "no hubo conexión con el servicio de IA");
  }
}

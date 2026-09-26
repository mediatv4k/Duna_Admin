// Capa de servicios del Portal de Aliados Comerciales (AdonisJS Core).
// Aislada del ERP interno: no importa ni depende de src/lib/firebase.js.

const ADONIS_BASE = "https://dev.carjos-marketplace.cloud";
const ADONIS_API_KEY = "bf8f1b64-6342-48c5-af05-501e4c15a6cb";

const TOKEN_STORAGE_KEY = "iac_store";
const USER_STORAGE_KEY = "ud_store";

export function obtenerTokenComercio() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function obtenerUsuarioComercio() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(USER_STORAGE_KEY) || "null");
  } catch (e) {
    return null;
  }
}

export function cerrarSesionComercio() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

/**
 * POST /user/token — intercambia usuario/clave por un token de acceso y lo persiste en "iac_store".
 */
export async function tokenComercio(user, password) {
  const cuerpo = new URLSearchParams({ userName: user, password, fToken: "" }).toString();
  const res = await fetch(`${ADONIS_BASE}/user/token`, {
    method: "POST",
    headers: { apiKey: ADONIS_API_KEY, "Content-Type": "application/x-www-form-urlencoded" },
    body: cuerpo,
  });

  let datos = null;
  try {
    datos = await res.json();
  } catch (e) {
    datos = null;
  }

  if (!res.ok || !datos || !(datos.code === 1 || datos.token)) {
    throw new Error(datos?.message || "Usuario o contraseña incorrectos.");
  }

  const token = datos.token || (typeof datos.data === "string" ? datos.data : datos.data?.token);
  if (!token) throw new Error("Adonis no devolvió un token válido.");

  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
  return token;
}

/**
 * GET /user/login — valida el token y trae los datos del usuario/comercio autenticado.
 * Persiste el resultado en "ud_store".
 */
export async function loginComercio(token) {
  const res = await fetch(`${ADONIS_BASE}/user/login`, {
    method: "GET",
    headers: { apiKey: ADONIS_API_KEY, Authorization: `Bearer ${token}` },
  });

  let datos = null;
  try {
    datos = await res.json();
  } catch (e) {
    datos = null;
  }

  if (!res.ok || !datos || datos.code !== 1) {
    throw new Error(datos?.message || "No se pudo validar la sesión.");
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(datos.data));
  }
  return datos.data;
}

/**
 * Flujo combinado para el formulario de login: token -> login, dejando
 * localStorage ("iac_store" / "ud_store") listo para el resto del portal.
 */
export async function iniciarSesionComercio(user, password) {
  const token = await tokenComercio(user, password);
  const usuario = await loginComercio(token);
  return { token, usuario };
}

// Adonis a veces devuelve `message` como objeto de validación: se serializa para no mostrar "[object Object]"
function textoMensaje(mensaje) {
  if (mensaje === null || mensaje === undefined) return "";
  return typeof mensaje === "object" ? JSON.stringify(mensaje) : String(mensaje);
}

/**
 * Normaliza el arreglo `errors` del batch v2 a [{ referencia, mensaje }].
 * En el backend `code` es el código (SKU) del producto; se procesa de forma defensiva.
 */
export function normalizarErroresBatch(errors) {
  if (!errors) return [];
  const lista = Array.isArray(errors) ? errors : [errors];
  return lista.map((err) => {
    if (err === null || typeof err !== "object") {
      return { referencia: "Producto", mensaje: textoMensaje(err) };
    }
    return {
      referencia: String(err.code || err.fila || "Producto"),
      mensaje: textoMensaje(err.message) || textoMensaje(err) || "Error sin detalle del servidor.",
    };
  });
}

/**
 * POST /store/:storeId/products/batch/v2 — Carga masiva de catálogo vía Excel.
 * Con { dryRun: true } el backend solo valida y devuelve { dryRun, preview: { toCreate, toUpdate, toDelete }, errors }
 * sin guardar nada. Si la petición falla, el Error lanzado trae `errores` (arreglo normalizado).
 */
export async function subirExcelBatchComercio(storeId, file, token, deleteMissing = false, { dryRun = false } = {}) {
  const formData = new FormData();
  formData.append('file', file);
  // Se envía en ambas grafías (camelCase y snake_case), tanto en query string como en el body
  // multipart, porque no está confirmado cuál lee el controlador de Adonis; así no se ignora.
  formData.append('deleteMissing', String(deleteMissing));
  formData.append('delete_missing', String(deleteMissing));

  // dryRun viaja estrictamente como query param (no se agrega al body multipart)
  const query = `deleteMissing=${deleteMissing}&delete_missing=${deleteMissing}&dryRun=${dryRun}`;
  const res = await fetch(`${ADONIS_BASE}/store/${storeId}/products/batch/v2?${query}`, {
    method: "POST",
    headers: {
      apiKey: ADONIS_API_KEY,
      Authorization: `Bearer ${token}`
      // Nota: No incluir "Content-Type", el navegador lo asigna automáticamente con el boundary para FormData.
    },
    body: formData,
  });

  let datos = null;
  try {
    datos = await res.json();
  } catch (e) {
    datos = null;
  }

  if (!res.ok || !datos || datos.code !== 1) {
    const error = new Error(textoMensaje(datos?.message) || `Error al procesar el archivo Excel en el servidor (HTTP ${res.status}).`);
    error.errores = normalizarErroresBatch(datos?.errors ?? datos?.data?.errors);
    throw error;
  }

  return datos;
}

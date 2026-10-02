"use client";
import React, { useEffect, useId, useState } from "react";
import { Loader2, Save, AlertTriangle, UtensilsCrossed } from "lucide-react";

// Configuración Gastronómica de una tienda, para el Master de Tiendas (src/app/admin/tiendas/page.jsx).
// Dos controles exclusivos de restaurantes que el servidor guarda como registros de metadata independientes,
// uno por control: type "STORE", subtype "GASTRONOMIA", key, value (texto "true"/"false") y external_id (id de
// la tienda).
//
// LECTURA — REAL. GET /metadata/type/STORE/subtype/GASTRONOMIA/externalId/:storeId con apiKey y el Bearer del
// administrador (useAuth().user.token, no iac_store). Verificado contra el backend el 2026-10-02: responde 200
// {"code":1,"data":[]}, un arreglo de registros que viene vacío cuando la tienda no tiene ninguno, y esa ruta
// no pedía ni apiKey ni token. La forma de un registro CON datos no está confirmada (todas las tiendas probadas
// venían vacías): se asume la de las filas genéricas de /store/:id/payment/info (key, value, type, subtype,
// external_id).
//
// GUARDADO — SIMULADO. El 2026-10-02 la ruta de escritura respondía 404, así que guardar solo arma el payload,
// lo imprime en consola y muestra un aviso temporal; el fetch real está comentado dentro de handleGuardar. No se
// persiste nada (ni en el servidor ni en localStorage): después de "guardar" los interruptores siguen mostrando
// lo elegido, pero lo que se lee del servidor no cambia.

const ADONIS_BASE = "https://dev.carjos-marketplace.cloud";
const ADONIS_API_KEY = process.env.NEXT_PUBLIC_SERVER_API_KEY || "bf8f1b64-6342-48c5-af05-501e4c15a6cb";

const TIPO_METADATA = "STORE";
const SUBTIPO_METADATA = "GASTRONOMIA";
const AVISO_SIMULADO_MS = 4000;

// Un control nuevo es una entrada más aquí: `clave` es la key del registro en el servidor
const CONTROLES = [
  {
    clave: "allow_customization",
    titulo: "Notas de cocina",
    descripcion: "El cliente puede escribir indicaciones por producto (sin cebolla, término de la carne).",
  },
  {
    clave: "allow_split_bill",
    titulo: "Pagos compartidos",
    descripcion: "La cuenta de un pedido puede dividirse entre varias personas.",
  },
];
const TODOS_APAGADOS = Object.fromEntries(CONTROLES.map((c) => [c.clave, false]));

// El servidor guarda "true"/"false" como texto; un booleano real también se acepta. Cualquier otra cosa
// (vacío, "1", "si") cuenta como apagado.
const comoBooleano = (valor) => (typeof valor === "boolean" ? valor : String(valor ?? "").trim().toLowerCase() === "true");

// La URL ya filtra por tipo, subtipo y tienda: esto solo descarta un registro ajeno si el servidor devolviera de más
const coincide = (dato, esperado) => dato === undefined || dato === null || String(dato).toUpperCase() === String(esperado).toUpperCase();

function mapearControles(filas, storeId) {
  return Object.fromEntries(
    CONTROLES.map((c) => {
      const propias = filas.filter(
        (f) => f && f.key === c.clave && coincide(f.type, TIPO_METADATA) && coincide(f.subtype, SUBTIPO_METADATA) && coincide(f.external_id, storeId)
      );
      // Si hubiera más de un registro con la misma key (un POST repetido), manda el de id más alto
      const vigente = propias.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0];
      return [c.clave, vigente ? comoBooleano(vigente.value) : false];
    })
  );
}

// Devuelve { allow_customization: boolean, allow_split_bill: boolean }. Un arreglo vacío (tienda sin registros)
// deja ambos controles apagados; cualquier otra forma de respuesta es un error, para no mostrar "apagado" por
// no entender lo que devolvió el servidor.
async function leerControlesGastronomia(storeId, token, signal) {
  const res = await fetch(`${ADONIS_BASE}/metadata/type/${TIPO_METADATA}/subtype/${SUBTIPO_METADATA}/externalId/${encodeURIComponent(storeId)}`, {
    headers: { apiKey: ADONIS_API_KEY, Authorization: `Bearer ${token}` },
    signal,
  });
  let datos = null;
  try {
    datos = await res.json();
  } catch (e) {
    datos = null;
  }
  if (!res.ok || !datos || (datos.code !== undefined && datos.code !== 1)) {
    const mensaje = typeof datos?.message === "object" ? JSON.stringify(datos.message) : datos?.message;
    throw new Error(mensaje || `Adonis respondió HTTP ${res.status} al leer la configuración.`);
  }
  if (!Array.isArray(datos.data)) {
    throw new Error(`el servidor devolvió un formato que no se reconoce (${JSON.stringify(datos).slice(0, 120)}).`);
  }
  return mapearControles(datos.data, storeId);
}

function InterruptorConfig({ id, titulo, descripcion, activo, deshabilitado, onCambiar }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p id={`${id}-titulo`} className="text-xs font-bold text-slate-800">{titulo}</p>
        <p id={`${id}-descripcion`} className="text-[11px] text-slate-500">{descripcion}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-descripcion`}
        disabled={deshabilitado}
        onClick={() => onCambiar(!activo)}
        className={`w-10 h-6 shrink-0 rounded-full relative transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${activo ? "bg-[#FE6712]" : "bg-slate-200"}`}
      >
        <span className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-[2px] transition-all ${activo ? "left-[18px]" : "left-[2px]"}`} />
      </button>
    </div>
  );
}

function ConfiguracionGastronomicaTienda({ storeId, token }) {
  const idBase = useId();
  // Sin token o sin tienda no hay nada que pedir: el motivo se deriva, no se guarda en estado
  const motivoSinLectura = !token
    ? "No hay un token de administrador en la sesión. Cierra sesión y vuelve a iniciarla."
    : storeId === undefined || storeId === null || storeId === ""
      ? "Falta el identificador de la tienda."
      : "";

  const [lectura, setLectura] = useState({ cargando: true, error: "" });
  // guardados = lo último leído del servidor; valores = lo que muestran los interruptores
  const [guardados, setGuardados] = useState(TODOS_APAGADOS);
  const [valores, setValores] = useState(TODOS_APAGADOS);
  // Marca de tiempo del último "guardado simulado" mientras su aviso siga visible; null si no hay aviso
  const [avisoSimulado, setAvisoSimulado] = useState(null);

  useEffect(() => {
    if (motivoSinLectura) return undefined;
    const controller = new AbortController();
    leerControlesGastronomia(storeId, token, controller.signal)
      .then((leidos) => {
        if (controller.signal.aborted) return;
        setGuardados(leidos);
        setValores(leidos);
        setLectura({ cargando: false, error: "" });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error(err);
        setLectura({ cargando: false, error: `No se pudo leer la configuración del servidor: ${err.message}` });
      });
    return () => controller.abort();
  }, [motivoSinLectura, storeId, token]);

  // El aviso del guardado simulado desaparece solo; un nuevo guardado reinicia el conteo
  useEffect(() => {
    if (avisoSimulado === null) return undefined;
    const temporizador = setTimeout(() => setAvisoSimulado(null), AVISO_SIMULADO_MS);
    return () => clearTimeout(temporizador);
  }, [avisoSimulado]);

  const cargando = !motivoSinLectura && lectura.cargando;
  const errorLectura = motivoSinLectura || lectura.error;
  const bloqueado = cargando || errorLectura !== "";
  const hayCambios = CONTROLES.some((c) => valores[c.clave] !== guardados[c.clave]);

  const handleGuardar = (e) => {
    e.preventDefault();
    if (bloqueado || !hayCambios) return;

    // Un registro independiente por control, con el valor como texto
    const payload = CONTROLES.map((c) => ({
      type: TIPO_METADATA,
      subtype: SUBTIPO_METADATA,
      key: c.clave,
      value: valores[c.clave] ? "true" : "false",
      external_id: storeId,
    }));

    // ESCRITURA REAL — DESACTIVADA a propósito: el 2026-10-02 la ruta de guardado respondía 404 y su verbo y
    // contrato no están confirmados (abajo se supone un POST por registro, a una ruta TENTATIVA /metadata; si el
    // contrato pide un arreglo, enviar `payload` completo en un solo request). Al activarla: borrar el
    // console.log y el aviso simulado de más abajo, volver esta función async con un estado `guardando`
    // (spinner y botón bloqueado) y releer con leerControlesGastronomia para confirmar lo que quedó guardado.
    //
    // const respuestas = await Promise.all(
    //   payload.map((registro) =>
    //     fetch(`${ADONIS_BASE}/metadata`, {
    //       method: "POST", // o PUT, según el contrato
    //       headers: { apiKey: ADONIS_API_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    //       body: JSON.stringify(registro),
    //     })
    //   )
    // );
    // if (respuestas.some((r) => !r.ok)) throw new Error("El servidor rechazó el guardado.");

    console.log("[ConfiguracionGastronomica] Guardado simulado, payload que se enviaría al servidor:", payload);
    setAvisoSimulado(Date.now());
  };

  return (
    <section aria-labelledby={`${idBase}-titulo`} className="border-t border-dashed border-slate-200 mt-4 pt-4 text-left space-y-3">
      <div>
        <h3 id={`${idBase}-titulo`} className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
          <UtensilsCrossed className="w-3.5 h-3.5 text-[#FE6712]" /> Configuración Gastronómica
        </h3>
        <p className="text-[11px] text-slate-400 mt-1">Controles exclusivos para restaurantes. Se leen de la metadata de la tienda en el servidor.</p>
      </div>

      {cargando ? (
        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          <Loader2 className="w-4 h-4 text-[#FE6712] animate-spin" /> Cargando configuración...
        </div>
      ) : (
        <form onSubmit={handleGuardar} className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl px-4 divide-y divide-slate-100">
            {CONTROLES.map((c) => (
              <InterruptorConfig
                key={c.clave}
                id={`${idBase}-${c.clave}`}
                titulo={c.titulo}
                descripcion={c.descripcion}
                activo={valores[c.clave]}
                deshabilitado={bloqueado}
                onCambiar={(nuevo) => setValores((prev) => ({ ...prev, [c.clave]: nuevo }))}
              />
            ))}
          </div>

          {errorLectura && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorLectura}</span>
            </div>
          )}

          {!errorLectura && (
            <div className="flex items-center justify-end gap-2">
              {avisoSimulado !== null && (
                <span role="status" className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] font-bold text-amber-800">
                  Guardado simulado (API pendiente)
                </span>
              )}
              {hayCambios && (
                <button
                  type="button"
                  onClick={() => setValores(guardados)}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[11px] font-bold hover:bg-slate-100 transition"
                >
                  Descartar cambios
                </button>
              )}
              <button
                type="submit"
                disabled={!hayCambios}
                className="px-3 py-1.5 bg-[#FE6712] hover:bg-[#ea580c] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Guardar
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

// key: al cambiar de tienda se descarta todo el estado (lectura, valores y aviso) en vez de arrastrar el anterior
export default function ConfiguracionGastronomica({ storeId, token }) {
  return <ConfiguracionGastronomicaTienda key={String(storeId)} storeId={storeId} token={token} />;
}

"use client";
import React, { useMemo, useState } from "react";
import { Check } from "lucide-react";

// Selector de Ficha Maestra: presentaciones (packs) sobre un pool global de sabores compartido.
// Construido contra el contrato de "metadata" propuesto en esta misma sesión (ver
// docs/ARQUITECTURA_METADATA_ADONIS.md para el precedente de cómo se verificó `metadata.farmacia`
// contra el backend real) — este esquema NO está verificado: no existe hoy ningún producto real con
// esta forma en Adonis. onConfirmar recibe { presentacionId, saboresElegidos } y no hace NINGUNA
// llamada de red: no existe todavía un endpoint de ajuste de stock al que conectar esta selección
// (ver /product/:id/stock/ajustar, propuesto pero no implementado — no hay acceso al backend).
//
// Regla de negocio (desacoplamiento absoluto status/stock): un sabor está agotado si status==="INACTIVE"
// (decisión humana, ej. descontinuado) O si controlStock está activo y stock<=0 (agotado temporal por
// venta) — nunca se combinan ni se confunden estas dos señales.
export function saborEstaAgotado(sabor, controlStock) {
  if (sabor?.status === "INACTIVE") return true;
  if (controlStock && Number(sabor?.stock) <= 0) return true;
  return false;
}

export default function SelectorFichaMaestra({ producto, onConfirmar }) {
  const meta = producto?.metadata || {};
  const controlStock = Boolean(meta.controlStock);
  const presentaciones = meta.presentaciones || [];

  const [presentacionId, setPresentacionId] = useState(presentaciones[0]?.id ?? null);
  const [saboresElegidos, setSaboresElegidos] = useState([]);

  const presentacion = presentaciones.find((p) => p.id === presentacionId) || null;
  const cantidadRequerida = presentacion?.cantidadSabores ?? 0;
  const faltantes = cantidadRequerida - saboresElegidos.length;
  const puedeConfirmar = presentacionId !== null && faltantes === 0;

  // Activos primero, agotados (por status o por stock=0) al fondo, con opacidad y bloqueo (regla de negocio)
  const saboresOrdenados = useMemo(() => {
    return Object.entries(meta.sabores || {}).sort(([, a], [, b]) => {
      const aAgotado = saborEstaAgotado(a, controlStock) ? 1 : 0;
      const bAgotado = saborEstaAgotado(b, controlStock) ? 1 : 0;
      return aAgotado - bAgotado;
    });
  }, [meta.sabores, controlStock]);

  const handleCambiarPresentacion = (id) => {
    setPresentacionId(id);
    setSaboresElegidos([]); // cambiar de presentación reinicia la selección: nunca la trunca ni la rellena
  };

  const handleToggleSabor = (clave, agotado) => {
    if (agotado) return; // bloqueo estricto del evento onClick, no solo del estilo visual
    setSaboresElegidos((prev) => {
      if (prev.includes(clave)) return prev.filter((c) => c !== clave);
      if (prev.length >= cantidadRequerida) return prev; // conteo exacto: nunca se permite exceder el límite
      return [...prev, clave];
    });
  };

  const handleConfirmar = () => {
    if (!puedeConfirmar) return;
    onConfirmar?.({ presentacionId, saboresElegidos });
  };

  if (presentaciones.length === 0) {
    return <p className="text-xs text-slate-400">Este producto no tiene presentaciones configuradas.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold text-slate-600 mb-1.5">Presentación</p>
        <div className="flex flex-wrap gap-2">
          {presentaciones.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleCambiarPresentacion(p.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                presentacionId === p.id
                  ? "bg-[#FE6712] text-white border-transparent shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {p.nombre} · ${Number(p.price).toFixed(2)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-bold text-slate-600">Sabores</p>
          <p className={`text-[11px] font-black ${faltantes === 0 ? "text-emerald-600" : "text-slate-500"}`}>
            {saboresElegidos.length} / {cantidadRequerida}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {saboresOrdenados.map(([clave, sabor]) => {
            const agotado = saborEstaAgotado(sabor, controlStock);
            const elegido = saboresElegidos.includes(clave);
            const bloqueado = agotado || (!elegido && faltantes === 0);
            return (
              <button
                key={clave}
                type="button"
                disabled={bloqueado}
                onClick={() => handleToggleSabor(clave, agotado)}
                className={`relative px-3 py-2.5 rounded-xl text-xs font-bold border text-left transition ${
                  agotado
                    ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400"
                    : elegido
                      ? "border-[#FE6712] bg-orange-50 text-[#FE6712]"
                      : bloqueado
                        ? "opacity-50 cursor-not-allowed bg-white border-slate-200 text-slate-600"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="flex items-center justify-between gap-1.5">
                  {sabor.nombre}
                  {elegido && <Check className="w-3.5 h-3.5 shrink-0" />}
                </span>
                {agotado && <span className="block text-[9px] font-black text-rose-500 mt-0.5">AGOTADO</span>}
                {controlStock && !agotado && Number(sabor.stock) <= 5 && (
                  <span className="block text-[9px] font-bold text-amber-500 mt-0.5">¡Últimas {sabor.stock}!</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={handleConfirmar}
        disabled={!puedeConfirmar}
        className="w-full py-3 bg-[#FE6712] hover:bg-[#ea580c] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-sm font-black transition shadow-sm"
      >
        {puedeConfirmar ? "Confirmar selección" : `Elige ${Math.max(faltantes, 0)} sabor${faltantes === 1 ? "" : "es"} más`}
      </button>
    </div>
  );
}

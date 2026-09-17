"use client";
import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, X, Search, ChevronDown, Lightbulb, Tag } from "lucide-react";
import manualData from "@/data/manualData";

const MODULO_LABEL = {
  INVENTARIO: "Inventario",
  CXC: "Ventas & CXC",
  CAJA: "Caja",
  COMPRAS: "Compras",
  GENERAL: "General",
};

const MODULO_ESTILO = {
  INVENTARIO: "bg-orange-50 text-[#FE6712]",
  CXC: "bg-emerald-50 text-emerald-700",
  CAJA: "bg-sky-50 text-sky-700",
  COMPRAS: "bg-amber-50 text-amber-700",
  GENERAL: "bg-slate-100 text-slate-500",
};

const RUTA_A_MODULO = {
  "/cxc": "CXC",
  "/inventario": "INVENTARIO",
  "/compras": "COMPRAS",
  "/": "GENERAL",
};

function coincideBusqueda(articulo, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    articulo.titulo.toLowerCase().includes(q) ||
    articulo.resumen.toLowerCase().includes(q) ||
    articulo.pasos.some((p) => p.toLowerCase().includes(q)) ||
    articulo.tips.some((t) => t.toLowerCase().includes(q)) ||
    articulo.palabrasClave.some((k) => k.toLowerCase().includes(q))
  );
}

function ArticuloManual({ articulo, expandido, onToggle }) {
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50 transition"
      >
        <div className="min-w-0">
          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide mb-1 ${MODULO_ESTILO[articulo.modulo] || MODULO_ESTILO.GENERAL}`}>
            {MODULO_LABEL[articulo.modulo] || articulo.modulo}
          </span>
          <h4 className="text-xs font-bold text-slate-900 truncate">{articulo.titulo}</h4>
          <p className="text-[11px] text-slate-500 line-clamp-1">{articulo.resumen}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expandido ? "rotate-180" : ""}`} />
      </button>
      {expandido && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">Pasos</span>
            <ol className="space-y-1.5">
              {articulo.pasos.map((paso, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-slate-700 leading-relaxed">
                  <span className="w-4 h-4 rounded-full bg-orange-50 text-[#FE6712] text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{paso}</span>
                </li>
              ))}
            </ol>
          </div>

          {articulo.tips.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1.5">
              {articulo.tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-emerald-700 font-medium leading-relaxed">
                  <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          )}

          {articulo.palabrasClave.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {articulo.palabrasClave.map((kw) => (
                <span key={kw} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold">
                  <Tag className="w-2.5 h-2.5" /> {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ManualDrawer() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [expandidoId, setExpandidoId] = useState(null);

  useEffect(() => {
    if (!abierto) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [abierto]);

  const moduloActual = RUTA_A_MODULO[pathname] || null;
  const articulosFiltrados = manualData.filter((a) => coincideBusqueda(a, busqueda));
  const sugeridas = moduloActual ? articulosFiltrados.filter((a) => a.modulo === moduloActual) : [];
  const resto = moduloActual ? articulosFiltrados.filter((a) => a.modulo !== moduloActual) : articulosFiltrados;

  const toggleArticulo = (id) => setExpandidoId((prev) => (prev === id ? null : id));

  return (
    <>
      {!abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          title="Manual y Guía Rápida"
          className="fixed bottom-6 right-6 z-[60] w-14 h-14 rounded-full bg-white border border-slate-200 shadow-lg flex items-center justify-center text-slate-500 hover:text-[#FE6712] hover:border-[#FE6712] hover:shadow-xl transition"
        >
          <HelpCircle className="w-6 h-6" />
        </button>
      )}

      <div
        onClick={() => setAbierto(false)}
        className={`fixed inset-0 z-[65] bg-slate-900/30 transition-opacity duration-300 ${
          abierto ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      <div
        className={`fixed top-0 right-0 z-[70] h-full w-full sm:w-96 bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
          abierto ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="border-b border-slate-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900">Manual y Guía Rápida</h3>
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-orange-50 text-[#FE6712] border border-orange-200 text-[10px] font-bold">
                {pathname || "/"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en el manual..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {articulosFiltrados.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">No se encontraron guías para tu búsqueda.</p>
          ) : (
            <>
              {sugeridas.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-black text-[#FE6712] uppercase tracking-wider">
                    Guías sugeridas para esta pantalla
                  </h4>
                  <div className="space-y-2">
                    {sugeridas.map((a) => (
                      <ArticuloManual
                        key={a.id}
                        articulo={a}
                        expandido={expandidoId === a.id}
                        onToggle={() => toggleArticulo(a.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {resto.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                    {sugeridas.length > 0 ? "Otras guías" : "Todas las guías"}
                  </h4>
                  <div className="space-y-2">
                    {resto.map((a) => (
                      <ArticuloManual
                        key={a.id}
                        articulo={a}
                        expandido={expandidoId === a.id}
                        onToggle={() => toggleArticulo(a.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

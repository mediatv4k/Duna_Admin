"use client";
import React from "react";
import { MapPin, Coins, RefreshCw, UserRound, Store } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { useUser, ROLES } from "@/context/UserContext";
import { useBusinessProfile, PERFILES_NEGOCIO } from "@/context/BusinessProfileContext";

const OPCIONES_MODO = [
  { valor: "dual", etiqueta: "Dual ($/Bs)" },
  { valor: "usd", etiqueta: "$ USD" },
  { valor: "ves", etiqueta: "Bs VES" },
];

const ROL_ETIQUETA = {
  ADMIN: "Admin",
  VENDEDOR: "Vendedor",
  CONTADOR: "Contador",
};

const PERFIL_ETIQUETA = {
  SIMPLE: "Simple",
  RETAIL: "Retail",
  GASTRONOMIA: "Gastronomía",
  FARMACIA: "Farmacia",
};

export default function CintilloTop() {
  const { modoMoneda, setModoMoneda, tasaBcv, cargandoTasa, ultimaHora, consultarApiBCV } = useCurrency();
  const { usuario, cambiarRol } = useUser();
  const { perfil, setPerfil } = useBusinessProfile();

  return (
    <div className="sticky top-0 z-50 bg-[#0a0e17] text-slate-300 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-9 flex items-center justify-between gap-4 text-[11px]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 font-semibold truncate">
            <MapPin className="w-3.5 h-3.5 text-[#FE6712] shrink-0" />
            <span className="truncate">Sede activa: Cabimas, Estado Zulia</span>
          </div>

          {usuario && (
            <div className="hidden sm:flex items-center gap-1.5 bg-white/5 rounded-full pl-2.5 pr-1.5 py-1 border border-white/10 shrink-0">
              <UserRound className="w-3.5 h-3.5 text-[#FE6712] shrink-0" />
              <span className="font-bold text-slate-100 whitespace-nowrap">
                {ROL_ETIQUETA[usuario.rol] || usuario.rol}: {usuario.nombre}
              </span>
              <select
                value={usuario.rol}
                onChange={(e) => cambiarRol(e.target.value)}
                title="Cambiar rol activo (solo pruebas)"
                className="bg-transparent text-[10px] text-slate-500 hover:text-white focus:outline-none cursor-pointer"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="text-slate-900">{ROL_ETIQUETA[r] || r}</option>
                ))}
              </select>
            </div>
          )}

          {perfil && (
            <div className="hidden md:flex items-center gap-1.5 bg-white/5 rounded-full pl-2.5 pr-1.5 py-1 border border-white/10 shrink-0">
              <Store className="w-3.5 h-3.5 text-[#FE6712] shrink-0" />
              <select
                value={perfil}
                onChange={(e) => setPerfil(e.target.value)}
                title="Cambiar perfil de negocio (solo pruebas)"
                className="bg-transparent text-[10px] font-bold text-slate-300 hover:text-white focus:outline-none cursor-pointer"
              >
                {PERFILES_NEGOCIO.map((p) => (
                  <option key={p} value={p} className="text-slate-900">{PERFIL_ETIQUETA[p] || p}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-white/5 rounded-full p-0.5 border border-white/10">
            {OPCIONES_MODO.map((op) => (
              <button
                key={op.valor}
                type="button"
                onClick={() => setModoMoneda(op.valor)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition whitespace-nowrap ${
                  modoMoneda === op.valor
                    ? "bg-[#FE6712] text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {op.etiqueta}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-white/5 rounded-full pl-2.5 pr-1 py-1 border border-white/10">
            <Coins className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-bold text-slate-100 whitespace-nowrap">
              Bs. {tasaBcv.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {ultimaHora && (
              <span className="hidden sm:inline text-slate-500 font-medium whitespace-nowrap">{ultimaHora}</span>
            )}
            <button
              type="button"
              onClick={consultarApiBCV}
              disabled={cargandoTasa}
              title="Actualizar tasa BCV"
              className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-[#FE6712] hover:bg-white/10 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${cargandoTasa ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Bike, Store, Wallet } from "lucide-react";
import { obtenerTokenComercio, obtenerUsuarioComercio, cerrarSesionComercio } from "@/lib/commerceServices";
import SidebarTienda from "@/components/comercios/SidebarTienda";

// ==============================================================================
// DATOS DE EJEMPLO — SIN CONECTAR A ADONIS
// ==============================================================================
// No existe hoy ningún endpoint de Adonis para listar los pedidos/cobros del turno de un comercio (el
// único endpoint de pedidos que existe en este frontend es para CREAR uno: POST
// /delivery/request/purchase/web). Misma decisión que en el Dashboard Ejecutivo (/reportes): esta vista
// se construye completa y funcional contra un set de datos de ejemplo, con esta única función como punto
// de conexión futura.
const METODOS_PAGO_LABEL = {
  ZELLE: "Zelle",
  BINANCE: "Binance",
  PAGO_MOVIL_BANESCO: "Pago Móvil - Banesco",
  PAGO_MOVIL_PROVINCIAL: "Pago Móvil - Provincial",
  EFECTIVO: "Efectivo",
  MONEDERO: "Monedero",
};

function cargarCierreCajaDemo() {
  return {
    fecha: "2026-09-27",
    cobros: [
      { metodoPago: "ZELLE", monto: 32.00 },
      { metodoPago: "BINANCE", monto: 18.50 },
      { metodoPago: "PAGO_MOVIL_BANESCO", monto: 41.75 },
      { metodoPago: "PAGO_MOVIL_PROVINCIAL", monto: 12.00 },
      { metodoPago: "EFECTIVO", monto: 27.25 },
      { metodoPago: "EFECTIVO", monto: 9.00 },
      { metodoPago: "MONEDERO", monto: 6.50 },
    ],
    pedidos: [
      { tipoServicio: "DELIVERY", monto: 24.50 },
      { tipoServicio: "PICKUP", monto: 12.00 },
      { tipoServicio: "DELIVERY", monto: 31.75 },
      { tipoServicio: "DELIVERY", monto: 9.50 },
      { tipoServicio: "PICKUP", monto: 18.00 },
      { tipoServicio: "PICKUP", monto: 27.00 },
      { tipoServicio: "DELIVERY", monto: 24.75 },
    ],
  };
}

function calcularCuadreCierreCaja(datos) {
  const totalFacturado = datos.cobros.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
  const porMetodo = {};
  datos.cobros.forEach((c) => {
    const clave = c.metodoPago || "SIN_ESPECIFICAR";
    porMetodo[clave] = (porMetodo[clave] || 0) + (Number(c.monto) || 0);
  });
  const porServicio = { DELIVERY: 0, PICKUP: 0 };
  datos.pedidos.forEach((p) => {
    const clave = p?.tipoServicio === "DELIVERY" ? "DELIVERY" : "PICKUP";
    porServicio[clave] += Number(p?.monto) || 0;
  });
  return { totalFacturado, porMetodo, porServicio };
}

function formatUsd(monto) {
  return `$${(Number(monto) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CierreCajaComercioPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [comercio, setComercio] = useState(null);
  const [verificandoSesion, setVerificandoSesion] = useState(true);

  useEffect(() => {
    const t = obtenerTokenComercio();
    if (!t) {
      router.replace("/comercios/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
    setToken(t);
    setComercio(obtenerUsuarioComercio());
    setVerificandoSesion(false);
  }, [router]);

  const storeId = comercio?.entityId || comercio?.storeId || comercio?.store?.id || comercio?.comercio_id || comercio?.id || null;

  const [datosDemo] = useState(() => cargarCierreCajaDemo());
  const cuadre = calcularCuadreCierreCaja(datosDemo);

  const handleCerrarSesion = () => {
    cerrarSesionComercio();
    router.replace("/comercios/login");
  };

  if (verificandoSesion || !token) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white">
      <SidebarTienda nombreComercio={comercio?.name || comercio?.nombre} storeId={storeId} />

      <div className="flex-1 min-h-screen bg-white text-slate-800 flex flex-col font-sans">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleCerrarSesion} title="Cerrar sesión" className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition border border-slate-200">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-900">Cierre de Caja</span>
              <span className="text-[11px] bg-orange-50 text-[#FE6712] px-2.5 py-0.5 rounded-full font-bold border border-orange-200">DEMO</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
          Datos de Ejemplo — no existe hoy un endpoint de Adonis para listar los cobros/pedidos del turno.
          Sustituir cargarCierreCajaDemo (arriba en este archivo) por la llamada real cuando el backend la entregue.
        </div>

        <div className="rounded-3xl border border-[#FE6712]/30 bg-[#FE6712]/5 p-6 text-center space-y-1">
          <p className="text-[11px] font-black text-[#FE6712] uppercase tracking-wide">Gran Total Facturado del Día</p>
          <p className="text-4xl font-black text-slate-900">{formatUsd(cuadre.totalFacturado)}</p>
          <p className="text-xs text-slate-400 font-medium">{datosDemo.fecha}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-[#FE6712]" />
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wide">Desglose por Método de Pago</h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
              <tr><th className="p-3">Método</th><th className="p-3 text-right">Monto</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(METODOS_PAGO_LABEL).map(([clave, label]) => (
                <tr key={clave}>
                  <td className="p-3 font-bold text-slate-800">{label}</td>
                  <td className="p-3 text-right font-bold text-slate-900">{formatUsd(cuadre.porMetodo[clave] || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0"><Bike className="w-5 h-5" /></div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase">Ventas Delivery</p>
              <p className="text-lg font-black text-slate-900">{formatUsd(cuadre.porServicio.DELIVERY)}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><Store className="w-5 h-5" /></div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase">Ventas Pick-up</p>
              <p className="text-lg font-black text-slate-900">{formatUsd(cuadre.porServicio.PICKUP)}</p>
            </div>
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}

"use client";
import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Lock, TrendingUp, Bike, Store, CreditCard, Wallet,
  Award, Loader2, DollarSign, Calendar, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import SidebarTienda from "@/components/comercios/SidebarTienda";

// ==============================================================================
// FUENTE DE DATOS (DEMO — SIN CONECTAR A ADONIS)
// ==============================================================================
// No existe hoy, en ningún punto de este repositorio, un endpoint de Adonis para
// listar pedidos por rango de fechas ni para movimientos de monedero (solo hay uno
// para CREAR un pedido: POST /delivery/request/purchase/web). Este módulo se
// construyó completo y funcional contra un set de datos de ejemplo, con un único
// punto de conexión (cargarPedidosDemo / cargarMovimientosMonederoDemo) para que,
// cuando el backend entregue esos endpoints reales, solo haya que reemplazar estas
// dos funciones por sus llamadas fetch — el resto del módulo (cálculos, vistas,
// formato) no debería necesitar cambios.

const PEDIDOS_DEMO = [
  { id: "PED-1042", fecha: "2026-09-20", tipoServicio: "DELIVERY", metodoPago: "PAGO_MOVIL", subtotal: 24.50, comisionPlataforma: 1.23, costoDelivery: 2.00, propina: 1.00,
    items: [
      { producto: "Hamburguesa Clásica", variante: "Doble carne", cantidad: 2, precioUnitario: 8.00 },
      { producto: "Refresco", variante: null, cantidad: 2, precioUnitario: 1.25 },
    ] },
  { id: "PED-1041", fecha: "2026-09-20", tipoServicio: "PICKUP", metodoPago: "ZELLE", subtotal: 12.00, comisionPlataforma: 0.60, costoDelivery: 0, propina: 0,
    items: [
      { producto: "Helado", variante: "Chocolate", cantidad: 3, precioUnitario: 4.00 },
    ] },
  { id: "PED-1039", fecha: "2026-09-19", tipoServicio: "DELIVERY", metodoPago: "EFECTIVO", subtotal: 31.75, comisionPlataforma: 1.59, costoDelivery: 2.50, propina: 2.00,
    items: [
      { producto: "Pizza Familiar", variante: "Pepperoni", cantidad: 1, precioUnitario: 18.00 },
      { producto: "Hamburguesa Clásica", variante: "Sencilla", cantidad: 1, precioUnitario: 6.00 },
      { producto: "Refresco", variante: null, cantidad: 2, precioUnitario: 1.25 },
    ] },
  { id: "PED-1035", fecha: "2026-09-18", tipoServicio: "DELIVERY", metodoPago: "SALDO", subtotal: 9.50, comisionPlataforma: 0.48, costoDelivery: 1.50, propina: 0.50,
    items: [
      { producto: "Helado", variante: "Vainilla", cantidad: 2, precioUnitario: 4.00 },
    ] },
  { id: "PED-1030", fecha: "2026-09-17", tipoServicio: "PICKUP", metodoPago: "PAGO_MOVIL", subtotal: 18.00, comisionPlataforma: 0.90, costoDelivery: 0, propina: 0,
    items: [
      { producto: "Pizza Familiar", variante: "Vegetariana", cantidad: 1, precioUnitario: 18.00 },
    ] },
  { id: "PED-1022", fecha: "2026-09-15", tipoServicio: "DELIVERY", metodoPago: "ZELLE", subtotal: 27.00, comisionPlataforma: 1.35, costoDelivery: 2.00, propina: 1.50,
    items: [
      { producto: "Hamburguesa Clásica", variante: "Doble carne", cantidad: 3, precioUnitario: 8.00 },
      { producto: "Helado", variante: "Chocolate", cantidad: 1, precioUnitario: 4.00 },
    ] },
  // Pedido "antiguo": sin arreglo de items (o con estructura incompleta). Debe leerse de forma
  // segura y no romper el ranking de productos ni ninguna otra vista (Regla de Oro 2).
  { id: "PED-0087", fecha: "2026-08-02", tipoServicio: "PICKUP", metodoPago: "EFECTIVO", subtotal: 15.00, comisionPlataforma: 0.75, costoDelivery: 0, propina: 0 },
];

const MOVIMIENTOS_MONEDERO_DEMO = [
  { id: "MOV-501", fecha: "2026-09-21", tipo: "RECARGA", monto: 50.00, descripcion: "Recarga vía Zelle" },
  { id: "MOV-500", fecha: "2026-09-20", tipo: "COMISION", monto: -6.15, descripcion: "Comisión de plataforma — lote 2026-09-20" },
  { id: "MOV-498", fecha: "2026-09-18", tipo: "RETIRO", monto: -30.00, descripcion: "Retiro a cuenta bancaria" },
  { id: "MOV-495", fecha: "2026-09-15", tipo: "RECARGA", monto: 40.00, descripcion: "Recarga vía Pago Móvil" },
];

function cargarPedidosDemo() {
  return PEDIDOS_DEMO;
}

function cargarMovimientosMonederoDemo() {
  return MOVIMIENTOS_MONEDERO_DEMO;
}

// ==============================================================================
// FÓRMULAS FINANCIERAS (Regla de Oro 1 — Integridad Financiera)
// ==============================================================================
// Única función que calcula el cuadre. Replica exactamente:
//   Ventas Netas - Comisiones - Delivery - Propinas = Neto del Periodo
// No modificar esta fórmula sin autorización expresa. Al conectar el backend real,
// solo cambia la fuente de "pedidos" (arriba); esta función no debería tocarse.
function calcularCuadreFinanciero(pedidos) {
  const ventasNetas = pedidos.reduce((acc, p) => acc + (Number(p.subtotal) || 0), 0);
  const comisiones = pedidos.reduce((acc, p) => acc + (Number(p.comisionPlataforma) || 0), 0);
  const delivery = pedidos.reduce((acc, p) => acc + (Number(p.costoDelivery) || 0), 0);
  const propinas = pedidos.reduce((acc, p) => acc + (Number(p.propina) || 0), 0);
  const neto = ventasNetas - comisiones - delivery - propinas;
  return { ventasNetas, comisiones, delivery, propinas, neto, cantidadPedidos: pedidos.length };
}

function calcularPorServicio(pedidos) {
  const grupos = { DELIVERY: { cantidad: 0, monto: 0 }, PICKUP: { cantidad: 0, monto: 0 } };
  pedidos.forEach((p) => {
    const clave = p?.tipoServicio === "DELIVERY" ? "DELIVERY" : "PICKUP";
    grupos[clave].cantidad += 1;
    grupos[clave].monto += Number(p?.subtotal) || 0;
  });
  return grupos;
}

const METODOS_PAGO_LABEL = { ZELLE: "Zelle", PAGO_MOVIL: "Pago Móvil", EFECTIVO: "Efectivo", SALDO: "Saldo (Monedero)" };

function calcularPorMetodoPago(pedidos) {
  const grupos = {};
  pedidos.forEach((p) => {
    const clave = p?.metodoPago || "SIN_ESPECIFICAR";
    if (!grupos[clave]) grupos[clave] = { cantidad: 0, monto: 0 };
    grupos[clave].cantidad += 1;
    grupos[clave].monto += Number(p?.subtotal) || 0;
  });
  return grupos;
}

// Regla de Oro 2 (No Destrucción de Metadata): lectura segura de items/variantes con encadenamiento
// opcional; un pedido antiguo sin "items" (o con estructura incompleta) nunca revienta este cálculo.
function calcularRankingProductos(pedidos) {
  const acumulado = new Map();
  (pedidos || []).forEach((p) => {
    const items = Array.isArray(p?.items) ? p.items : [];
    items.forEach((it) => {
      if (!it || typeof it !== "object") return;
      const nombreBase = it?.producto || "Producto sin nombre";
      const variante = it?.variante || it?.sabor || null;
      const clave = variante ? `${nombreBase} — ${variante}` : nombreBase;
      const cantidad = Number(it?.cantidad) || 0;
      const monto = cantidad * (Number(it?.precioUnitario) || 0);
      const previo = acumulado.get(clave) || { nombre: clave, unidades: 0, monto: 0 };
      previo.unidades += cantidad;
      previo.monto += monto;
      acumulado.set(clave, previo);
    });
  });
  return [...acumulado.values()].sort((a, b) => b.unidades - a.unidades);
}

function filtrarPedidosPorRango(pedidos, desde, hasta) {
  return (pedidos || []).filter((p) => (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta));
}

function formatUsd(monto) {
  return `$${(Number(monto) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatBs(montoUsd, tasaBcv) {
  return `Bs. ${((Number(montoUsd) || 0) * (tasaBcv || 0)).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TABS = [
  { id: "resumen", label: "Resumen Ejecutivo", icono: TrendingUp },
  { id: "pedidos", label: "Desglose de Pedidos", icono: Bike },
  { id: "productos", label: "Inteligencia Comercial", icono: Award },
  { id: "monedero", label: "Monedero", icono: Wallet },
];

function TarjetaKpi({ etiqueta, valor, subvalor, icono: Icono, acento = "text-slate-900", destacado = false }) {
  return (
    <div className={`rounded-2xl border p-4 space-y-1 ${destacado ? "bg-[#FE6712]/5 border-[#FE6712]/30" : "bg-white border-slate-200"}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
        {Icono && <Icono className="w-3.5 h-3.5" />}
        {etiqueta}
      </div>
      <p className={`text-xl font-black ${acento}`}>{valor}</p>
      {subvalor && <p className="text-[11px] text-slate-400 font-medium">{subvalor}</p>}
    </div>
  );
}

export default function ReportesPage() {
  const { isAdmin, loading: cargandoAuth, logout } = useAuth();
  const { tasaBcv } = useCurrency();
  const router = useRouter();

  // Esta página se llega tanto desde el dashboard del ERP principal como desde el enlace "Reportes"
  // del sidebar del Portal de Comercios — pero su sesión real es siempre la del ERP (useAuth/isAdmin
  // arriba), nunca la del portal de comercios. Por eso el sidebar recibe su propio logout: el que trae
  // por defecto cerraría una sesión de comercio inexistente y mandaría a /comercios/login en vez de /login.
  const handleCerrarSesionErp = () => {
    logout();
    router.replace("/login");
  };

  // Regla de Oro 2 (No Destrucción de Metadata) usada también aquí como guardia general:
  // los datos vienen de una función reemplazable, nunca de un objeto mutado a mano.
  const [pedidos] = useState(() => cargarPedidosDemo());
  const [movimientosMonedero] = useState(() => cargarMovimientosMonederoDemo());

  const fechas = pedidos.map((p) => p.fecha).sort();
  const [desde, setDesde] = useState(fechas[0] || "");
  const [hasta, setHasta] = useState(fechas[fechas.length - 1] || "");
  const [vistaActiva, setVistaActiva] = useState("resumen");

  const pedidosFiltrados = useMemo(() => filtrarPedidosPorRango(pedidos, desde, hasta), [pedidos, desde, hasta]);
  const cuadre = useMemo(() => calcularCuadreFinanciero(pedidosFiltrados), [pedidosFiltrados]);
  const porServicio = useMemo(() => calcularPorServicio(pedidosFiltrados), [pedidosFiltrados]);
  const porMetodoPago = useMemo(() => calcularPorMetodoPago(pedidosFiltrados), [pedidosFiltrados]);
  const rankingProductos = useMemo(() => calcularRankingProductos(pedidosFiltrados), [pedidosFiltrados]);
  const ticketPromedio = cuadre.cantidadPedidos > 0 ? cuadre.ventasNetas / cuadre.cantidadPedidos : 0;

  if (cargandoAuth) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
      </div>
    );
  }

  // Regla de Oro 3 (Aislamiento de Roles y Costos): toda esta vista es financiera sensible
  // (comisiones, monedero, márgenes) — solo Administración/Gerencia puede verla. El mostrador
  // (POS) no tiene ningún enlace a esta página ni comparte estos cálculos.
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-sm p-8 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-base font-black text-slate-900">Acceso restringido</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Liquidaciones, comisiones y el monedero solo están disponibles para roles de Administración o Gerencia.
          </p>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FE6712] hover:underline pt-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white">
      <SidebarTienda onCerrarSesion={handleCerrarSesionErp} />

      <div className="flex-1 min-h-screen bg-white text-slate-800 flex flex-col font-sans">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center gap-3">
          <Link href="/" title="Volver al inicio" className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition border border-slate-200">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-900">Liquidaciones y Reportes</span>
              <span className="text-[11px] bg-orange-50 text-[#FE6712] px-2.5 py-0.5 rounded-full font-bold border border-orange-200">DEMO</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Datos de ejemplo — sin conectar a Adonis todavía</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
          Este módulo se alimenta de un set de datos de ejemplo (PEDIDOS_DEMO / MOVIMIENTOS_MONEDERO_DEMO,
          arriba en este archivo). No hay conexión real a Adonis: no existe hoy un endpoint para listar
          pedidos ni movimientos de monedero. Sustituir cargarPedidosDemo/cargarMovimientosMonederoDemo por
          las llamadas reales cuando el backend las entregue.
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <Calendar className="w-4 h-4 text-[#FE6712]" /> Periodo
          </div>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" aria-label="Desde" />
          <span className="text-xs text-slate-400">hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" aria-label="Hasta" />
          <div className="text-xs text-slate-500 font-medium sm:ml-auto">
            <strong className="text-slate-900 font-bold">{cuadre.cantidadPedidos}</strong> pedidos en el periodo
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setVistaActiva(t.id)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border ${
                vistaActiva === t.id ? "bg-[#FE6712] text-white border-transparent shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <t.icono className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {vistaActiva === "resumen" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <TarjetaKpi etiqueta="Ventas Netas" valor={formatUsd(cuadre.ventasNetas)} subvalor={formatBs(cuadre.ventasNetas, tasaBcv)} icono={DollarSign} />
              <TarjetaKpi etiqueta="Comisiones" valor={`− ${formatUsd(cuadre.comisiones)}`} acento="text-rose-600" icono={CreditCard} />
              <TarjetaKpi etiqueta="Delivery" valor={`− ${formatUsd(cuadre.delivery)}`} acento="text-rose-600" icono={Bike} />
              <TarjetaKpi etiqueta="Propinas" valor={`− ${formatUsd(cuadre.propinas)}`} acento="text-rose-600" icono={Wallet} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 rounded-2xl border border-[#FE6712]/30 bg-[#FE6712]/5 p-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black text-[#FE6712] uppercase tracking-wide">Neto del Periodo</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Ventas Netas − Comisiones − Delivery − Propinas</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-slate-900">{formatUsd(cuadre.neto)}</p>
                  <p className="text-xs text-slate-500 font-semibold">{formatBs(cuadre.neto, tasaBcv)}</p>
                </div>
              </div>
              <TarjetaKpi etiqueta="Ticket Promedio" valor={formatUsd(ticketPromedio)} subvalor={`${cuadre.cantidadPedidos} pedidos`} icono={TrendingUp} destacado />
            </div>
          </div>
        )}

        {vistaActiva === "pedidos" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0"><Bike className="w-5 h-5" /></div>
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Delivery</p>
                  <p className="text-lg font-black text-slate-900">{porServicio.DELIVERY.cantidad} <span className="text-xs font-bold text-slate-400">pedidos</span></p>
                  <p className="text-xs text-slate-500 font-semibold">{formatUsd(porServicio.DELIVERY.monto)}</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><Store className="w-5 h-5" /></div>
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Pick-up</p>
                  <p className="text-lg font-black text-slate-900">{porServicio.PICKUP.cantidad} <span className="text-xs font-bold text-slate-400">pedidos</span></p>
                  <p className="text-xs text-slate-500 font-semibold">{formatUsd(porServicio.PICKUP.monto)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200">
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-wide">Cuadre por Método de Pago</h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr><th className="p-3">Método</th><th className="p-3">Pedidos</th><th className="p-3">Monto</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.keys(porMetodoPago).length === 0 ? (
                    <tr><td colSpan="3" className="p-6 text-center text-slate-400">Sin pedidos en el periodo seleccionado.</td></tr>
                  ) : (
                    Object.entries(porMetodoPago).map(([metodo, datos]) => (
                      <tr key={metodo}>
                        <td className="p-3 font-bold text-slate-800">{METODOS_PAGO_LABEL[metodo] || metodo}</td>
                        <td className="p-3 text-slate-600">{datos.cantidad}</td>
                        <td className="p-3 font-bold text-slate-900">{formatUsd(datos.monto)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {vistaActiva === "productos" && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wide">Ranking de Productos y Sabores</h3>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                <tr><th className="p-3 w-10">#</th><th className="p-3">Producto / Sabor</th><th className="p-3">Unidades</th><th className="p-3">Monto</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rankingProductos.length === 0 ? (
                  <tr><td colSpan="4" className="p-6 text-center text-slate-400">Sin productos vendidos en el periodo seleccionado.</td></tr>
                ) : (
                  rankingProductos.map((item, idx) => (
                    <tr key={item.nombre}>
                      <td className="p-3 text-slate-400 font-bold">{idx + 1}</td>
                      <td className="p-3 font-bold text-slate-800">{item.nombre}</td>
                      <td className="p-3 text-slate-600">{item.unidades}</td>
                      <td className="p-3 font-bold text-slate-900">{formatUsd(item.monto)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {vistaActiva === "monedero" && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wide">Historial y Movimientos del Monedero</h3>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                <tr><th className="p-3">Fecha</th><th className="p-3">Tipo</th><th className="p-3">Descripción</th><th className="p-3 text-right">Monto</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movimientosMonedero.length === 0 ? (
                  <tr><td colSpan="4" className="p-6 text-center text-slate-400">Sin movimientos registrados.</td></tr>
                ) : (
                  movimientosMonedero.map((mov) => {
                    const positivo = Number(mov.monto) >= 0;
                    return (
                      <tr key={mov.id}>
                        <td className="p-3 text-slate-500 font-medium">{mov.fecha}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${positivo ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                            {mov.tipo}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700">{mov.descripcion}</td>
                        <td className={`p-3 text-right font-bold flex items-center justify-end gap-1 ${positivo ? "text-emerald-600" : "text-rose-600"}`}>
                          {positivo ? <ArrowUpCircle className="w-3.5 h-3.5" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
                          {formatUsd(mov.monto)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

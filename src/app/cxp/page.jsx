"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Wallet, AlertTriangle, Clock3, CheckCircle2,
  History, Check, X
} from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";

const METODOS_PAGO_PROVEEDOR = ["Transferencia Bancaria", "Pago Móvil", "Efectivo USD", "Efectivo Bs"];
const METODOS_CON_DATOS_BANCARIOS = ["Transferencia Bancaria", "Pago Móvil"];

const FILTROS = [
  { valor: "TODAS", etiqueta: "Todas" },
  { valor: "VENCIDA", etiqueta: "Vencidas" },
  { valor: "POR_VENCER", etiqueta: "Por Vencer" },
  { valor: "AL_DIA", etiqueta: "Al Día" },
  { valor: "PAGADA", etiqueta: "Pagadas" },
];

const ESTADO_CONFIG = {
  VENCIDA: { label: "Vencida", clase: "bg-rose-50 text-rose-700 border-rose-200" },
  POR_VENCER: { label: "Por Vencer", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  AL_DIA: { label: "Al Día", clase: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PAGADA: { label: "Pagada", clase: "bg-slate-100 text-slate-500 border-slate-200" },
};

function formatearBs(montoUsd, tasaBcv) {
  return (montoUsd * tasaBcv).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Días entre hoy y el vencimiento (positivo = faltan días, negativo = días de atraso). Pura: depende solo de los strings recibidos.
function calcularDiasRestantes(fechaVencimiento, hoyISO) {
  if (!fechaVencimiento || !hoyISO) return null;
  const venc = new Date(`${fechaVencimiento}T00:00:00`);
  const hoy = new Date(`${hoyISO}T00:00:00`);
  if (Number.isNaN(venc.getTime()) || Number.isNaN(hoy.getTime())) return null;
  return Math.round((venc.getTime() - hoy.getTime()) / 86400000);
}

function calcularEstadoFactura(factura, hoyISO) {
  if ((Number(factura.saldoPendienteUsd) || 0) <= 0 || factura.status === "PAGADA") return "PAGADA";
  const dias = calcularDiasRestantes(factura.fechaVencimiento, hoyISO);
  if (dias === null) return "AL_DIA";
  if (dias < 0) return "VENCIDA";
  if (dias <= 5) return "POR_VENCER";
  return "AL_DIA";
}

export default function CXPPage() {
  const { tasaBcv } = useCurrency();

  const [cxp, setCxp] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [hoyISO, setHoyISO] = useState("");
  const [filtroActivo, setFiltroActivo] = useState("TODAS");

  const [modalAbonoAbierto, setModalAbonoAbierto] = useState(false);
  const [facturaAbonoActual, setFacturaAbonoActual] = useState(null);
  const [monedaAbono, setMonedaAbono] = useState("usd");
  const [montoAbonoInput, setMontoAbonoInput] = useState("");
  const [metodoPago, setMetodoPago] = useState("Transferencia Bancaria");
  const [bancoDestino, setBancoDestino] = useState("");
  const [referencia, setReferencia] = useState("");

  const [modalHistorialAbierto, setModalHistorialAbierto] = useState(false);
  const [facturaHistorialActual, setFacturaHistorialActual] = useState(null);

  useEffect(() => {
    const cxpGuardado = localStorage.getItem("duna_cxp");
    if (cxpGuardado) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
        setCxp(JSON.parse(cxpGuardado));
      } catch (e) {
        console.error(e);
      }
    }

    const pagosGuardados = localStorage.getItem("duna_cxp_pagos");
    if (pagosGuardados) {
      try {
        setPagos(JSON.parse(pagosGuardados));
      } catch (e) {
        console.error(e);
      }
    }

    setHoyISO(new Date().toISOString().slice(0, 10));
  }, []);

  const actualizarCxp = (nuevos) => {
    setCxp(nuevos);
    localStorage.setItem("duna_cxp", JSON.stringify(nuevos));
  };

  const actualizarPagos = (nuevos) => {
    setPagos(nuevos);
    localStorage.setItem("duna_cxp_pagos", JSON.stringify(nuevos));
  };

  // --- Resumen financiero ---
  const facturasConSaldo = cxp.filter(c => (Number(c.saldoPendienteUsd) || 0) > 0);
  const deudaTotalUsd = facturasConSaldo.reduce((acc, c) => acc + c.saldoPendienteUsd, 0);

  const vencidas = facturasConSaldo.filter(c => calcularEstadoFactura(c, hoyISO) === "VENCIDA");
  const porVencer = facturasConSaldo.filter(c => calcularEstadoFactura(c, hoyISO) === "POR_VENCER");
  const alDia = facturasConSaldo.filter(c => calcularEstadoFactura(c, hoyISO) === "AL_DIA");

  const montoVencidoUsd = vencidas.reduce((acc, c) => acc + c.saldoPendienteUsd, 0);
  const montoPorVencerUsd = porVencer.reduce((acc, c) => acc + c.saldoPendienteUsd, 0);
  const montoAlDiaUsd = alDia.reduce((acc, c) => acc + c.saldoPendienteUsd, 0);

  const facturasFiltradas = cxp.filter(c => filtroActivo === "TODAS" || calcularEstadoFactura(c, hoyISO) === filtroActivo);

  // --- Modal de Abono / Finiquito ---
  const abrirModalAbono = (factura) => {
    setFacturaAbonoActual(factura);
    setMonedaAbono("usd");
    setMontoAbonoInput("");
    setMetodoPago("Transferencia Bancaria");
    setBancoDestino("");
    setReferencia("");
    setModalAbonoAbierto(true);
  };

  const handleFiniquito = () => {
    if (!facturaAbonoActual) return;
    const saldo = facturaAbonoActual.saldoPendienteUsd;
    setMontoAbonoInput(String(monedaAbono === "ves" ? (saldo * tasaBcv).toFixed(2) : saldo.toFixed(2)));
  };

  const handleAbonoParcial = () => {
    setMontoAbonoInput("");
  };

  const montoAbonoUsd = monedaAbono === "ves"
    ? (Number(montoAbonoInput) || 0) / (tasaBcv || 1)
    : (Number(montoAbonoInput) || 0);

  const requiereDatosBancarios = METODOS_CON_DATOS_BANCARIOS.includes(metodoPago);

  const confirmarAbonoProveedor = () => {
    if (!facturaAbonoActual || montoAbonoUsd <= 0) {
      alert("Indica un monto válido a abonar.");
      return;
    }

    if (requiereDatosBancarios) {
      const ref = referencia.trim();
      if (!ref) {
        alert("Indica el número de referencia del pago.");
        return;
      }
      const yaUsada = pagos.some(p => (p.referencia || "").trim().toLowerCase() === ref.toLowerCase());
      if (yaUsada) {
        alert("Esta referencia ya fue registrada anteriormente. Verifica el número.");
        return;
      }
    }

    const montoUsd = montoAbonoUsd;
    const montoBs = monedaAbono === "ves" ? (Number(montoAbonoInput) || 0) : montoUsd * tasaBcv;
    const nuevoSaldo = Math.max(0, facturaAbonoActual.saldoPendienteUsd - montoUsd);
    const nuevoStatus = nuevoSaldo <= 0 ? "PAGADA" : "PENDIENTE";

    const cxpActualizado = cxp.map(c =>
      c.id === facturaAbonoActual.id ? { ...c, saldoPendienteUsd: nuevoSaldo, status: nuevoStatus } : c
    );
    actualizarCxp(cxpActualizado);

    const nuevoPago = {
      id: `pago_${Date.now()}`,
      cxpId: facturaAbonoActual.id,
      nroFactura: facturaAbonoActual.nroFactura,
      fecha: new Date().toLocaleString("es-VE"),
      montoUsd,
      montoBs,
      tasaBcv,
      metodo: metodoPago,
      bancoDestino: requiereDatosBancarios ? bancoDestino : "",
      referencia: requiereDatosBancarios ? referencia.trim() : "",
    };
    actualizarPagos([nuevoPago, ...pagos]);

    setModalAbonoAbierto(false);
    setFacturaAbonoActual(null);
  };

  // --- Modal de Historial ---
  const abrirModalHistorial = (factura) => {
    setFacturaHistorialActual(factura);
    setModalHistorialAbierto(true);
  };
  const pagosDeFacturaActual = facturaHistorialActual
    ? pagos.filter(p => p.cxpId === facturaHistorialActual.id)
    : [];

  const pillClase = (activo) =>
    `px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
      activo ? "bg-[#FE6712] text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200 hover:border-[#FE6712] hover:text-[#FE6712]"
    }`;

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col font-sans">

      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-[37px] z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition border border-slate-200">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <Link href="/" className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- logo local pequeño, no requiere optimización de next/image */}
                <img src="/logo-duna-admin.png" alt="D'una Admin" className="h-8 w-auto object-contain" />
                <span className="text-[11px] bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full font-bold border border-rose-200">CXP</span>
              </Link>
              <p className="text-[11px] text-slate-400 font-medium">Cuentas por Pagar a Proveedores</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-6">

        {/* Tarjetas de resumen */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">
              <span>Deuda Global</span>
              <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900">${deudaTotalUsd.toFixed(2)}</div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium">~Bs. {formatearBs(deudaTotalUsd, tasaBcv)}</div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">
              <span>Vencido</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600">${montoVencidoUsd.toFixed(2)}</div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium">{vencidas.length} factura{vencidas.length === 1 ? "" : "s"}</div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">
              <span>Por Vencer (≤5 días)</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock3 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-600">${montoPorVencerUsd.toFixed(2)}</div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium">{porVencer.length} factura{porVencer.length === 1 ? "" : "s"}</div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">
              <span>Al Día</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-600">${montoAlDiaUsd.toFixed(2)}</div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium">{alDia.length} factura{alDia.length === 1 ? "" : "s"}</div>
          </div>
        </div>

        {/* Filtros rápidos */}
        <div className="bg-white p-3 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-1.5">
          {FILTROS.map(f => (
            <button key={f.valor} type="button" onClick={() => setFiltroActivo(f.valor)} className={pillClase(filtroActivo === f.valor)}>
              {f.etiqueta}
            </button>
          ))}
        </div>

        {/* Tabla de facturas por pagar */}
        {facturasFiltradas.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-2 shadow-sm my-8">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Wallet className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900">Sin facturas en este filtro</h3>
            <p className="text-xs text-slate-500">Las compras a crédito registradas en /compras aparecerán aquí automáticamente.</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-4">Proveedor</th>
                    <th className="p-4">Nº Factura</th>
                    <th className="p-4">Nº Control</th>
                    <th className="p-4">Emisión</th>
                    <th className="p-4">Vencimiento</th>
                    <th className="p-4">Días</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Saldo Pendiente</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {facturasFiltradas.map((c) => {
                    const estado = calcularEstadoFactura(c, hoyISO);
                    const dias = calcularDiasRestantes(c.fechaVencimiento, hoyISO);
                    const cfg = ESTADO_CONFIG[estado];
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition">
                        <td className="p-4">
                          <span className="font-bold text-slate-800 block">{c.razonSocial}</span>
                          <span className="text-[11px] text-slate-400">{c.documentoProveedor}</span>
                        </td>
                        <td className="p-4 font-black text-slate-900">{c.nroFactura}</td>
                        <td className="p-4 text-slate-500">{c.nroControl || "—"}</td>
                        <td className="p-4 text-slate-600">{c.fechaEmision}</td>
                        <td className="p-4 text-slate-600">{c.fechaVencimiento}</td>
                        <td className="p-4">
                          {estado === "PAGADA" ? (
                            <span className="text-slate-400">—</span>
                          ) : dias !== null && dias < 0 ? (
                            <span className="font-bold text-rose-600">{Math.abs(dias)}d atraso</span>
                          ) : (
                            <span className="font-bold text-slate-600">{dias ?? "—"}d restantes</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${cfg.clase}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="p-4 font-black text-slate-900">${c.totalUsd.toFixed(2)}</td>
                        <td className="p-4">
                          <span className="font-black text-slate-900 block">${c.saldoPendienteUsd.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-400">Bs. {formatearBs(c.saldoPendienteUsd, tasaBcv)}</span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {c.saldoPendienteUsd > 0 && (
                              <button
                                onClick={() => abrirModalAbono(c)}
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-[11px] transition"
                              >
                                Abonar / Liquidar
                              </button>
                            )}
                            <button
                              onClick={() => abrirModalHistorial(c)}
                              title="Ver historial de pagos"
                              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
                            >
                              <History className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal Abono / Finiquito Proveedor */}
      {modalAbonoAbierto && facturaAbonoActual && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Abonar / Liquidar</h3>
                <p className="text-xs text-slate-400">{facturaAbonoActual.razonSocial} • Factura {facturaAbonoActual.nroFactura}</p>
              </div>
              <button onClick={() => setModalAbonoAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
              <span className="text-[11px] font-bold text-rose-500 uppercase block">Saldo Pendiente</span>
              <div className="text-2xl font-black text-rose-700">${facturaAbonoActual.saldoPendienteUsd.toFixed(2)}</div>
              <div className="text-xs text-rose-500 font-semibold">Bs. {formatearBs(facturaAbonoActual.saldoPendienteUsd, tasaBcv)}</div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Moneda de Pago</label>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setMonedaAbono("usd")} className={pillClase(monedaAbono === "usd")}>$ USD</button>
                <button type="button" onClick={() => setMonedaAbono("ves")} className={pillClase(monedaAbono === "ves")}>Bs VES</button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button type="button" onClick={handleFiniquito} className="flex-1 px-3 py-2 bg-orange-50 hover:bg-[#FE6712] text-[#FE6712] hover:text-white border border-orange-200 rounded-xl text-xs font-bold transition">
                Pagar 100% (Finiquito)
              </button>
              <button type="button" onClick={handleAbonoParcial} className="flex-1 px-3 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold transition">
                Abono Parcial
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Monto a Abonar ({monedaAbono === "usd" ? "$" : "Bs."})</label>
              <input
                type="number"
                step="0.01"
                value={montoAbonoInput}
                onChange={(e) => setMontoAbonoInput(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
              {Number(montoAbonoInput) > 0 && (
                <p className="text-[11px] text-emerald-600 font-bold mt-1.5">
                  {monedaAbono === "ves"
                    ? `≈ $${montoAbonoUsd.toFixed(2)} USD`
                    : `≈ Bs. ${formatearBs(montoAbonoUsd, tasaBcv)}`}
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Método de Pago</label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
              >
                {METODOS_PAGO_PROVEEDOR.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {requiereDatosBancarios && (
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={bancoDestino} onChange={(e) => setBancoDestino(e.target.value)} placeholder="Banco destino" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                <input type="text" required value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° de referencia *" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setModalAbonoAbierto(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarAbonoProveedor}
                disabled={montoAbonoUsd <= 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Confirmar Pago
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historial de Pagos */}
      {modalHistorialAbierto && facturaHistorialActual && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Historial de Pagos</h3>
                <p className="text-xs text-slate-400">{facturaHistorialActual.razonSocial} • Factura {facturaHistorialActual.nroFactura}</p>
              </div>
              <button onClick={() => setModalHistorialAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {pagosDeFacturaActual.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Aún no se han registrado pagos para esta factura.</p>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Monto</th>
                      <th className="p-3">Método</th>
                      <th className="p-3">Referencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagosDeFacturaActual.map((p) => (
                      <tr key={p.id}>
                        <td className="p-3 text-slate-600">{p.fecha}</td>
                        <td className="p-3">
                          <span className="font-black text-slate-900 block">${p.montoUsd.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-400">Bs. {p.montoBs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </td>
                        <td className="p-3 text-slate-600">{p.metodo}</td>
                        <td className="p-3 text-slate-500">{p.referencia || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setModalHistorialAbierto(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

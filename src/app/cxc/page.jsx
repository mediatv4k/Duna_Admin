"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Search, Check, X,
  Receipt, Trash2, MessageCircle, ArrowRight, ShieldCheck, Printer,
} from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import bancosVenezuela from "@/data/bancosVenezuela";

const METODOS_PAGO = [
  "Efectivo USD",
  "Efectivo Bs",
  "Pago Móvil",
  "Transf. Mismo Banco",
  "Transf. Interbancaria",
  "Tarjeta Débito/Crédito",
  "Zelle",
];

const METODOS_CON_REFERENCIA = ["Pago Móvil", "Transf. Mismo Banco", "Transf. Interbancaria"];

const DATOS_PAGO_INICIAL = {
  metodoPago: "Efectivo USD",
  bancoEmisor: "",
  bancoReceptor: "",
  referencia: "",
  titular: "",
};

function limpiarTelefono(str) {
  return String(str || "").replace(/\D/g, "").replace(/^0+/, "");
}

function formatearBs(montoUsd, tasaBcv) {
  return (montoUsd * tasaBcv).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CXCPage() {
  const { modoMoneda, tasaBcv } = useCurrency();

  const [cuentas, setCuentas] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarModalReporte, setMostrarModalReporte] = useState(false);

  const [modalAbonoAbierto, setModalAbonoAbierto] = useState(false);
  const [cuentaAbonoActual, setCuentaAbonoActual] = useState(null);
  const [monedaAbonoModal, setMonedaAbonoModal] = useState("usd");
  const [montoAbonoModal, setMontoAbonoModal] = useState("");
  const [pagoAbonoModal, setPagoAbonoModal] = useState(DATOS_PAGO_INICIAL);

  // Cargar datos locales
  useEffect(() => {
    const guardadas = localStorage.getItem("duna_cxc_records");
    if (guardadas) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
        setCuentas(JSON.parse(guardadas));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const actualizarCuentas = (nuevas) => {
    setCuentas(nuevas);
    localStorage.setItem("duna_cxc_records", JSON.stringify(nuevas));
  };

  // Modal dedicado de abonos posteriores
  const abrirModalAbono = (cuenta) => {
    setCuentaAbonoActual(cuenta);
    setMonedaAbonoModal("usd");
    setMontoAbonoModal("");
    setPagoAbonoModal(DATOS_PAGO_INICIAL);
    setModalAbonoAbierto(true);
  };

  const montoAbonoModalUsd = monedaAbonoModal === "ves"
    ? (Number(montoAbonoModal) || 0) / (tasaBcv || 1)
    : (Number(montoAbonoModal) || 0);

  // Referencias ya usadas en cualquier abono registrado, para evitar duplicidad
  const referenciasUsadas = new Set(
    cuentas.flatMap(c => (c.historialAbonos || []).map(h => h.referencia).filter(Boolean))
  );

  const requiereDatosTransferenciaAbono = METODOS_CON_REFERENCIA.includes(pagoAbonoModal.metodoPago);
  const referenciaAbonoDuplicada = requiereDatosTransferenciaAbono &&
    pagoAbonoModal.referencia.trim().length > 0 &&
    referenciasUsadas.has(pagoAbonoModal.referencia.trim());

  const confirmarAbono = () => {
    if (!cuentaAbonoActual || montoAbonoModalUsd <= 0) return;

    if (requiereDatosTransferenciaAbono) {
      const ref = pagoAbonoModal.referencia.trim();
      if (!ref) {
        alert("Indica el número de referencia del pago.");
        return;
      }
      if (referenciasUsadas.has(ref)) {
        alert("Esta referencia ya fue registrada anteriormente. Verifica el número.");
        return;
      }
    }

    const nuevoAbonado = cuentaAbonoActual.abonado + montoAbonoModalUsd;
    const nuevoSaldo = Math.max(0, cuentaAbonoActual.total - nuevoAbonado);
    const nuevoEstado = nuevoSaldo === 0 ? "PAGADO" : "PARCIAL";
    const registroAbono = {
      fecha: new Date().toLocaleString("es-VE"),
      moneda: monedaAbonoModal,
      montoOriginal: Number(montoAbonoModal) || 0,
      tasaBcv,
      montoUsd: montoAbonoModalUsd,
      metodoPago: pagoAbonoModal.metodoPago,
      bancoEmisor: requiereDatosTransferenciaAbono ? pagoAbonoModal.bancoEmisor : "",
      bancoReceptor: requiereDatosTransferenciaAbono ? pagoAbonoModal.bancoReceptor : "",
      referencia: requiereDatosTransferenciaAbono ? pagoAbonoModal.referencia.trim() : "",
      titular: requiereDatosTransferenciaAbono ? pagoAbonoModal.titular : "",
    };

    const actualizadas = cuentas.map(c => {
      if (c.id === cuentaAbonoActual.id) {
        return {
          ...c,
          abonado: nuevoAbonado,
          saldo: nuevoSaldo,
          estado: nuevoEstado,
          historialAbonos: [...(c.historialAbonos || []), registroAbono],
        };
      }
      return c;
    });
    actualizarCuentas(actualizadas);
    setModalAbonoAbierto(false);
    setCuentaAbonoActual(null);
  };

  const handleEliminarCuenta = (id) => {
    if (confirm("¿Seguro que deseas eliminar este registro?")) {
      actualizarCuentas(cuentas.filter(c => c.id !== id));
    }
  };

  const handleEnviarWhatsapp = (cuenta) => {
    const numero = `${(cuenta.paisCodigo || "+58").replace("+", "")}${limpiarTelefono(cuenta.telefono)}`;
    const saldoBs = formatearBs(cuenta.saldo, tasaBcv);

    let lineasProductos;
    if (cuenta.renglones && cuenta.renglones.length > 0) {
      lineasProductos = cuenta.renglones.map(r => {
        const variantePart = r.variante ? ` (${r.variante})` : "";
        const extrasPart = r.toppings && r.toppings.length > 0 ? ` [Extras: ${r.toppings.map(t => t.nombre).join(", ")}]` : "";
        return `• ${r.cantidad}x ${r.nombre}${variantePart}${extrasPart} - $${r.subtotal.toFixed(2)}`;
      }).join("\n");
    } else {
      // Compatibilidad con facturas de un solo producto registradas antes del ticket multi-renglón
      const lineaExtras = cuenta.extras && cuenta.extras.length > 0 ? ` [Extras: ${cuenta.extras.join(", ")}]` : "";
      lineasProductos = `• ${cuenta.cantidad}x ${cuenta.productoNombre} ($${(cuenta.precioBaseUnitario || 0).toFixed(2)})${lineaExtras}`;
    }

    const mensaje = `Estimado(a) *${cuenta.cliente}*, le saludamos de *D'una*. Le compartimos el estado de su cuenta:\n${lineasProductos}\nFactura: *${cuenta.id}* | Total: *$${cuenta.total.toFixed(2)}* | Abonado: *$${cuenta.abonado.toFixed(2)}* | Saldo pendiente: *$${cuenta.saldo.toFixed(2)} USD* (*Bs. ${saldoBs}* a Tasa BCV: Bs. ${tasaBcv}). Quedamos atentos a su comprobante.`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
  };

  // Totales
  const totalPorCobrarUsd = cuentas.reduce((acc, c) => acc + c.saldo, 0);
  const totalCobradoUsd = cuentas.reduce((acc, c) => acc + c.abonado, 0);

  const formatearMonto = (montoUsd) => {
    const bcv = formatearBs(montoUsd, tasaBcv);
    if (modoMoneda === "usd") return `$${montoUsd.toFixed(2)}`;
    if (modoMoneda === "ves") return `Bs. ${bcv}`;
    return `$${montoUsd.toFixed(2)} / Bs. ${bcv}`;
  };

  const cuentasFiltradas = cuentas.filter(c =>
    c.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.id.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.documento.toLowerCase().includes(busqueda.toLowerCase())
  );

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
                <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">VENTAS & CXC</span>
              </Link>
              <p className="text-[11px] text-slate-400 font-medium">Cartera de Créditos y Cobranzas</p>
            </div>
          </div>

          <Link
            href="/pos"
            className="px-4 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition flex items-center gap-2 shadow-sm shadow-orange-500/20"
          >
            Ir a Terminal POS (Ventas) <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-6">

        {/* Métricas CXC */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-400">Total por Cobrar (Deuda Total)</span>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {formatearMonto(totalPorCobrarUsd)}
            </div>
            <p className="text-[11px] text-amber-600 font-semibold mt-1">Saldos pendientes en calle</p>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-400">Total Recaudado (Abonos)</span>
            <div className="text-2xl font-black text-emerald-700 mt-2">
              {formatearMonto(totalCobradoUsd)}
            </div>
            <p className="text-[11px] text-emerald-600 font-semibold mt-1">Cobrado en el periodo</p>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm sm:col-span-2 lg:col-span-1">
            <span className="text-xs font-bold text-slate-400">Facturas con Saldo</span>
            <div className="text-2xl font-black text-slate-900 mt-2">{cuentas.filter(c => c.saldo > 0).length}</div>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">de {cuentas.length} documentos comerciales</p>
          </div>
        </div>

        {/* Acceso al Reporte / Estado Vacío */}
        {cuentas.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm my-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Receipt className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Sin facturas ni deudas</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Las ventas se registran desde la Terminal POS del mostrador; aquí verás la cartera de créditos y cobranzas resultante.
              </p>
            </div>
            <Link
              href="/pos"
              className="px-5 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition inline-flex items-center gap-2 shadow-sm"
            >
              Ir a Terminal POS (Ventas) <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm my-8">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto text-2xl">
              📊
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Reporte e Historial Detallado de Cuentas por Cobrar</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                La tabla completa de facturas y saldos se mantiene resguardada aquí para agilizar la vista principal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMostrarModalReporte(true)}
              className="px-5 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition inline-flex items-center gap-2 shadow-sm"
            >
              📊 Ver Reporte e Historial de Facturas
            </button>
          </div>
        )}
      </main>

      {/* Modal Reporte e Historial de Facturas */}
      {mostrarModalReporte && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-900">Reporte e Historial de Facturas</h3>
                <p className="text-xs text-slate-400">Cartera completa de créditos y cobranzas</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarModalReporte(false)}
                  className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 pb-0 shrink-0">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por cliente, cédula o factura..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FE6712] transition"
                />
              </div>
            </div>

            <div className="overflow-y-auto p-5 flex-1">
              <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-4">Factura / Fecha</th>
                        <th className="p-4">Cliente</th>
                        <th className="p-4">Concepto</th>
                        <th className="p-4">Total</th>
                        <th className="p-4">Saldo Pendiente</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cuentasFiltradas.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/50 transition">
                          <td className="p-4">
                            <strong className="text-slate-900 block font-black">{c.id}</strong>
                            <span className="text-[11px] text-slate-400">{c.fecha}</span>
                            {c.autorizadoPor && (
                              <span
                                title={`Autorizado por ${c.autorizadoPor.supervisorNombre} · ${c.autorizadoPor.horaAutorizacion}`}
                                className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 text-[9px] font-black border border-sky-200"
                              >
                                <ShieldCheck className="w-2.5 h-2.5" /> Autorizado
                              </span>
                            )}
                          </td>
                          <td className="p-4">
                            <span className="font-bold text-slate-800 block">{c.cliente}</span>
                            <span className="text-[11px] text-slate-400">{c.documento} • {c.telefono ? `${c.paisCodigo || ""} ${c.telefono}` : "Sin teléfono"}</span>
                          </td>
                          <td className="p-4 text-slate-600">
                            {c.renglones && c.renglones.length > 0 ? (
                              <>
                                <span className="font-semibold text-slate-700 block">
                                  {c.renglones[0].nombre}{c.renglones[0].variante ? ` (${c.renglones[0].variante})` : ""} x{c.renglones[0].cantidad}
                                </span>
                                {c.renglones.length > 1 && (
                                  <span className="text-[11px] text-slate-400">
                                    +{c.renglones.length - 1} artículo{c.renglones.length - 1 === 1 ? "" : "s"} más
                                  </span>
                                )}
                              </>
                            ) : (
                              <>{c.productoNombre} (x{c.cantidad})</>
                            )}
                          </td>
                          <td className="p-4 font-black text-slate-900">
                            {formatearMonto(c.total)}
                          </td>
                          <td className="p-4 font-black text-rose-600">
                            {c.saldo > 0 ? formatearMonto(c.saldo) : "$0.00"}
                          </td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                              c.estado === "PAGADO"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : c.estado === "PARCIAL"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}>
                              {c.estado}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEnviarWhatsapp(c)}
                                disabled={!c.telefono}
                                title={c.telefono ? "Enviar estado de cuenta por WhatsApp" : "Sin teléfono registrado"}
                                className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg border border-emerald-200 hover:border-emerald-600 transition disabled:opacity-30 disabled:pointer-events-none"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                              {c.saldo > 0 && (
                                <button
                                  onClick={() => abrirModalAbono(c)}
                                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-[11px] transition"
                                >
                                  Abonar
                                </button>
                              )}
                              <button
                                onClick={() => handleEliminarCuenta(c.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end p-4 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setMostrarModalReporte(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition"
              >
                Cerrar Reporte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Abono Posterior */}
      {modalAbonoAbierto && cuentaAbonoActual && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Registrar Abono</h3>
                <p className="text-xs text-slate-400">Factura {cuentaAbonoActual.id} • {cuentaAbonoActual.cliente}</p>
              </div>
              <button onClick={() => setModalAbonoAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
              <span className="text-[11px] font-bold text-rose-500 uppercase block">Saldo Pendiente</span>
              <div className="text-2xl font-black text-rose-700">${cuentaAbonoActual.saldo.toFixed(2)}</div>
              <div className="text-xs text-rose-500 font-semibold">Bs. {formatearBs(cuentaAbonoActual.saldo, tasaBcv)}</div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Moneda de Pago</label>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setMonedaAbonoModal("usd")} className={pillClase(monedaAbonoModal === "usd")}>$ USD</button>
                <button type="button" onClick={() => setMonedaAbonoModal("ves")} className={pillClase(monedaAbonoModal === "ves")}>Bs VES</button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Monto a Abonar ({monedaAbonoModal === "usd" ? "$" : "Bs."})</label>
              <input
                type="number"
                step="0.01"
                value={montoAbonoModal}
                onChange={(e) => setMontoAbonoModal(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
              {Number(montoAbonoModal) > 0 && (
                <p className="text-[11px] text-emerald-600 font-bold mt-1.5">
                  {monedaAbonoModal === "ves"
                    ? `≈ $${montoAbonoModalUsd.toFixed(2)} USD`
                    : `≈ Bs. ${formatearBs(montoAbonoModalUsd, tasaBcv)}`}
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Método de Pago</label>
              <select
                value={pagoAbonoModal.metodoPago}
                onChange={(e) => setPagoAbonoModal({ ...pagoAbonoModal, metodoPago: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
              >
                {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {requiereDatosTransferenciaAbono && (
              <div className="grid grid-cols-2 gap-3">
                <select value={pagoAbonoModal.bancoEmisor} onChange={(e) => setPagoAbonoModal({ ...pagoAbonoModal, bancoEmisor: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <option value="">Banco emisor...</option>
                  {bancosVenezuela.map(b => <option key={b.codigo} value={b.codigo}>{b.display}</option>)}
                </select>
                <select value={pagoAbonoModal.bancoReceptor} onChange={(e) => setPagoAbonoModal({ ...pagoAbonoModal, bancoReceptor: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <option value="">Banco receptor...</option>
                  {bancosVenezuela.map(b => <option key={b.codigo} value={b.codigo}>{b.display}</option>)}
                </select>
                <div className="col-span-2">
                  <input
                    type="text"
                    required
                    value={pagoAbonoModal.referencia}
                    onChange={(e) => setPagoAbonoModal({ ...pagoAbonoModal, referencia: e.target.value })}
                    placeholder="N° de referencia *"
                    className={`w-full px-3 py-2 border rounded-xl text-xs focus:outline-none ${
                      referenciaAbonoDuplicada ? "bg-rose-50 border-rose-400" : "bg-slate-50 border-slate-200 focus:border-[#FE6712]"
                    }`}
                  />
                  {referenciaAbonoDuplicada && (
                    <p className="text-[10px] text-rose-600 font-bold mt-1">Esta referencia ya fue registrada anteriormente.</p>
                  )}
                </div>
                <input type="text" value={pagoAbonoModal.titular} onChange={(e) => setPagoAbonoModal({ ...pagoAbonoModal, titular: e.target.value })} placeholder="Teléfono / Titular" className="col-span-2 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setModalAbonoAbierto(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarAbono}
                disabled={montoAbonoModalUsd <= 0 || referenciaAbonoDuplicada}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Confirmar Abono
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

"use client";
import React, { useState, useEffect, useMemo } from "react";
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
  const [vistaActiva, setVistaActiva] = useState("cartera"); // "cartera" | "clientes"
  const [busquedaWorkspace, setBusquedaWorkspace] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("TODAS"); // "TODAS" | "CON_SALDO" | "PAGADAS"

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

  // Cuentas filtradas en modal de reporte
  const cuentasFiltradas = cuentas.filter(c =>
    c.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.id.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.documento.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Cuentas filtradas en workspace
  const cuentasWorkspace = useMemo(() => {
    return cuentas.filter((c) => {
      const q = busquedaWorkspace.trim().toLowerCase();
      const coincideBusqueda =
        !q ||
        c.cliente.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.documento || "").toLowerCase().includes(q);

      if (!coincideBusqueda) return false;

      if (filtroEstado === "CON_SALDO") return c.saldo > 0;
      if (filtroEstado === "PAGADAS") return c.saldo === 0 || c.estado === "PAGADO";
      return true;
    });
  }, [cuentas, busquedaWorkspace, filtroEstado]);

  // Consolidado de clientes deudores
  const clientesDeudores = useMemo(() => {
    const mapa = {};
    cuentas.forEach((c) => {
      if (c.saldo > 0) {
        const clave = (c.documento || c.cliente || c.id).trim().toLowerCase();
        if (!mapa[clave]) {
          mapa[clave] = {
            id: clave,
            cliente: c.cliente,
            documento: c.documento,
            telefono: c.telefono,
            paisCodigo: c.paisCodigo,
            deudaTotal: 0,
            facturas: [],
          };
        }
        mapa[clave].deudaTotal += c.saldo;
        mapa[clave].facturas.push(c);
      }
    });
    return Object.values(mapa).sort((a, b) => b.deudaTotal - a.deudaTotal);
  }, [cuentas]);

  const pillClase = (activo) =>
    `px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
      activo ? "bg-[#FE6712] text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200 hover:border-[#FE6712] hover:text-[#FE6712]"
    }`;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-800">

      {/* 1. Estructura de Panel Dividido: Barra Lateral Izquierda Fija */}
      <aside className="w-full md:w-64 bg-white text-slate-700 flex flex-col p-4 border-r border-slate-200 shadow-sm shrink-0 md:h-screen md:sticky md:top-0">

        {/* Encabezado superior con identificador del sistema */}
        <div className="pb-4 pt-1 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FE6712] shadow-sm shadow-[#FE6712]/50 inline-block shrink-0" />
            <span className="text-xs font-black tracking-wider text-slate-900 uppercase">
              D&apos;UNA ADMIN / CXC
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 pl-5 font-medium">
            Gestión de Cartera y Cobranzas
          </p>
        </div>

        {/* Menú de navegación vertical con botones estilizados */}
        <nav className="mt-5 space-y-1.5 flex-1">
          <button
            type="button"
            onClick={() => setVistaActiva("cartera")}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
              vistaActiva === "cartera"
                ? "bg-orange-50 text-[#FE6712] font-bold border-l-4 border-[#FE6712]"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span className="text-sm">📋</span>
              <span>Cartera y Saldos</span>
            </span>
            {cuentas.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold border border-slate-200">
                {cuentas.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMostrarModalReporte(true)}
            className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-between text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 group"
          >
            <span className="flex items-center gap-2.5">
              <span className="text-sm">📊</span>
              <span>Reporte e Historial</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100/70 text-[#FE6712] font-semibold group-hover:bg-[#FE6712] group-hover:text-white transition">
              Abrir
            </span>
          </button>

          <button
            type="button"
            onClick={() => setVistaActiva("clientes")}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
              vistaActiva === "clientes"
                ? "bg-orange-50 text-[#FE6712] font-bold border-l-4 border-[#FE6712]"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span className="text-sm">👤</span>
              <span>Clientes Deudores</span>
            </span>
            {clientesDeudores.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold border border-slate-200">
                {clientesDeudores.length}
              </span>
            )}
          </button>
        </nav>

        {/* Enlace inferior para saltar al mostrador */}
        <div className="mt-auto pt-4 border-t border-slate-100 space-y-2">
          <Link
            href="/pos"
            className="w-full py-2.5 px-3 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm text-xs font-bold transition flex items-center justify-center gap-2"
          >
            <span>← Terminal POS</span>
          </Link>
          <Link
            href="/"
            className="w-full py-2 px-3 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100/80 text-[11px] font-medium transition flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Volver al Inicio
          </Link>
        </div>
      </aside>

      {/* 2. Lienzo Central (Workspace dinámico) */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto space-y-7">

        {/* Cabecera del área de trabajo */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  VENTAS & CXC
                </span>
                <span className="text-xs text-slate-400">• ERP D&apos;una</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
                {vistaActiva === "cartera" ? "Cartera y Saldos de Crédito" : "Clientes Deudores"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {vistaActiva === "cartera"
                  ? "Control administrativo de cuentas por cobrar, abonos comerciales y auditoría de créditos."
                  : "Consolidación de clientes con saldos activos para gestión de cobro oportuno."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMostrarModalReporte(true)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" /> Reporte Imprimible
              </button>
              <Link
                href="/pos"
                className="px-4 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-orange-500/20"
              >
                Ir a Terminal POS <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Métricas rápidas en tarjetas horizontales compactas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total por Cobrar</span>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {formatearMonto(totalPorCobrarUsd)}
              </div>
              <p className="text-[11px] text-rose-600 font-semibold mt-1">
                Saldos pendientes en calle
              </p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Facturas Pendientes</span>
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {cuentas.filter((c) => c.saldo > 0).length}
                <span className="text-xs font-normal text-slate-400 ml-1.5">
                  / {cuentas.length} documentos
                </span>
              </div>
              <p className="text-[11px] text-amber-600 font-semibold mt-1">
                Documentos con saldo activo
              </p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Recaudado</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="text-2xl font-black text-emerald-700 mt-2">
                {formatearMonto(totalCobradoUsd)}
              </div>
              <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                Cobrado en el periodo
              </p>
            </div>
          </div>
        </div>

        {/* Contenido Central Estructurado */}
        {cuentas.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm my-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Receipt className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Sin facturas ni deudas registradas</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Las ventas y créditos se originan desde la Terminal POS del mostrador; aquí podrás gestionar la cobranza y auditar los abonos.
              </p>
            </div>
            <Link
              href="/pos"
              className="px-5 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition inline-flex items-center gap-2 shadow-sm"
            >
              Ir a Terminal POS (Ventas) <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : vistaActiva === "cartera" ? (
          /* Vista: Cartera y Saldos */
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Barra de herramientas */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={busquedaWorkspace}
                  onChange={(e) => setBusquedaWorkspace(e.target.value)}
                  placeholder="Buscar por cliente, factura o cédula..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FE6712] transition"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFiltroEstado("TODAS")}
                  className={pillClase(filtroEstado === "TODAS")}
                >
                  Todas ({cuentas.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstado("CON_SALDO")}
                  className={pillClase(filtroEstado === "CON_SALDO")}
                >
                  Pendientes ({cuentas.filter((c) => c.saldo > 0).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstado("PAGADAS")}
                  className={pillClase(filtroEstado === "PAGADAS")}
                >
                  Pagadas ({cuentas.filter((c) => c.saldo === 0 || c.estado === "PAGADO").length})
                </button>
              </div>
            </div>

            {/* Tabla de Cartera */}
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
                  {cuentasWorkspace.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-xs text-slate-400">
                        No se encontraron registros que coincidan con el filtro actual.
                      </td>
                    </tr>
                  ) : (
                    cuentasWorkspace.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition">
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
                          <span className="text-[11px] text-slate-400">
                            {c.documento} • {c.telefono ? `${c.paisCodigo || ""} ${c.telefono}` : "Sin teléfono"}
                          </span>
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
                          <div className="flex items-center justify-end gap-1.5">
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
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-[11px] transition shadow-sm"
                              >
                                Abonar
                              </button>
                            )}
                            <button
                              onClick={() => handleEliminarCuenta(c.id)}
                              title="Eliminar factura"
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pie de tabla con resumen */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500 gap-2">
              <span>
                Mostrando <strong>{cuentasWorkspace.length}</strong> de <strong>{cuentas.length}</strong> documentos comerciales
              </span>
              <button
                type="button"
                onClick={() => setMostrarModalReporte(true)}
                className="text-[#FE6712] hover:underline font-bold self-start sm:self-auto flex items-center gap-1"
              >
                Ver reporte imprimible con filtros avanzados →
              </button>
            </div>
          </div>
        ) : (
          /* Vista: Clientes Deudores */
          <div className="space-y-4">
            {clientesDeudores.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-3 shadow-sm">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-xl">
                  ✓
                </div>
                <h3 className="text-base font-extrabold text-slate-900">Sin Clientes Deudores</h3>
                <p className="text-xs text-slate-500">
                  ¡Excelente! En este momento no hay clientes con saldo pendiente de pago. Todos los créditos están al día o saldados.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clientesDeudores.map((cli) => {
                  const saldoBs = formatearBs(cli.deudaTotal, tasaBcv);
                  return (
                    <div
                      key={cli.id}
                      className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-black text-slate-900 leading-snug">
                              {cli.cliente}
                            </h3>
                            <p className="text-[11px] text-slate-400 font-medium">
                              {cli.documento || "Sin Cédula"}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                            {cli.facturas.length} {cli.facturas.length === 1 ? "factura" : "facturas"}
                          </span>
                        </div>

                        <div className="bg-rose-50/70 border border-rose-100 rounded-2xl p-3">
                          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">
                            Deuda Total Acumulada
                          </span>
                          <div className="text-xl font-black text-rose-700 mt-0.5">
                            ${cli.deudaTotal.toFixed(2)}
                          </div>
                          <span className="text-[11px] text-rose-500 font-semibold block">
                            Bs. {saldoBs}
                          </span>
                        </div>

                        {/* Desglose de facturas pendientes */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Facturas pendientes:
                          </span>
                          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                            {cli.facturas.map((f) => (
                              <div
                                key={f.id}
                                className="flex items-center justify-between text-[11px] bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100"
                              >
                                <span className="font-bold text-slate-700">{f.id}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-rose-600">
                                    ${f.saldo.toFixed(2)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => abrirModalAbono(f)}
                                    className="text-[10px] text-emerald-700 hover:underline font-black"
                                  >
                                    Abonar
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Botón WhatsApp de cobranza */}
                      <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        {cli.telefono ? (
                          <button
                            type="button"
                            onClick={() => {
                              // Mensaje consolidado de cobro
                              const num = `${(cli.paisCodigo || "+58").replace("+", "")}${limpiarTelefono(cli.telefono)}`;
                              const detalle = cli.facturas.map((f) => `• Factura ${f.id}: saldo $${f.saldo.toFixed(2)}`).join("\n");
                              const msg = `Estimado(a) *${cli.cliente}*, le saludamos de *D'una*. Le informamos que mantiene un saldo pendiente acumulado de *$${cli.deudaTotal.toFixed(2)} USD* (*Bs. ${saldoBs}* a Tasa BCV: Bs. ${tasaBcv}):\n${detalle}\n\nQuedamos atentos a su pago o comprobante.`;
                              window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
                            }}
                            className="w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border border-emerald-200 hover:border-transparent shadow-sm"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> Cobrar por WhatsApp
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Sin teléfono registrado
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Reporte e Historial de Facturas */}
      {mostrarModalReporte && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 shrink-0 bg-white">
              <div>
                <h3 className="text-lg font-black text-slate-900">Reporte e Historial de Facturas</h3>
                <p className="text-xs text-slate-500">Cartera completa de créditos y cobranzas</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200"
                >
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarModalReporte(false)}
                  className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 flex items-center justify-center transition shrink-0"
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
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 bg-white">
              <div>
                <h3 className="text-lg font-black text-slate-900">Registrar Abono</h3>
                <p className="text-xs text-slate-500">Factura {cuentaAbonoActual.id} • {cuentaAbonoActual.cliente}</p>
              </div>
              <button onClick={() => setModalAbonoAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 flex items-center justify-center transition">
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

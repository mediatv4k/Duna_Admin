"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Search, Plus, Check, X, Trash2,
  Truck, Package, FileText
} from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { escucharColeccion, guardarDocumento } from "@/lib/firebase";

const TIPOS_DOCUMENTO_PROVEEDOR = ["J-", "G-", "V-", "E-"];
const OPCIONES_DIAS_CREDITO = [0, 7, 15, 30, 45, 60];

function extraerDigitos(raw) {
  return String(raw || "").replace(/\D/g, "");
}

// Normaliza el RIF/documento del proveedor: quita puntos/espacios y asegura guion tras el prefijo
function normalizarDocumentoProveedor(raw) {
  if (!raw) return "";
  const limpio = String(raw).toUpperCase().replace(/[.\s]/g, "");
  const match = limpio.match(/^([JGVE])-?(.+)$/);
  return match ? `${match[1]}-${match[2]}` : limpio;
}

function formatearBs(montoUsd, tasaBcv) {
  return (montoUsd * tasaBcv).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Suma días de crédito a una fecha de emisión (YYYY-MM-DD) sin depender del reloj del sistema
function calcularVencimiento(fechaEmision, dias) {
  if (!fechaEmision) return "";
  const fecha = new Date(`${fechaEmision}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return "";
  fecha.setDate(fecha.getDate() + (Number(dias) || 0));
  return fecha.toISOString().slice(0, 10);
}

const FORM_PROVEEDOR_INICIAL = {
  tipoDocumento: "J-",
  numeroDocumento: "",
  razonSocial: "",
  contacto: "",
  telefono: "",
  direccion: "",
  diasCredito: 30,
};

const FORM_COMPRA_INICIAL = {
  nroFactura: "",
  nroControl: "",
  fechaEmision: "",
  fechaVencimiento: "",
  condicion: "CREDITO",
};

const RENGLON_INICIAL = {
  productoId: "",
  varianteNombre: "",
  cantidad: 1,
  costoUnitario: "",
};

export default function ComprasPage() {
  const { tasaBcv } = useCurrency();

  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [compras, setCompras] = useState([]);
  const [cxp, setCxp] = useState([]);

  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);
  const [busquedaProveedor, setBusquedaProveedor] = useState("");
  const [mostrarSugerenciasProveedor, setMostrarSugerenciasProveedor] = useState(false);

  const [modalProveedorAbierto, setModalProveedorAbierto] = useState(false);
  const [formProveedor, setFormProveedor] = useState(FORM_PROVEEDOR_INICIAL);

  const [formCompra, setFormCompra] = useState(FORM_COMPRA_INICIAL);
  const [renglones, setRenglones] = useState([]);
  const [renglonActual, setRenglonActual] = useState(RENGLON_INICIAL);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [mostrarSugerenciasProducto, setMostrarSugerenciasProducto] = useState(false);

  const [modalDetalleAbierto, setModalDetalleAbierto] = useState(false);
  const [compraDetalleActual, setCompraDetalleActual] = useState(null);

  useEffect(() => {
    const prods = localStorage.getItem("duna_productos");
    if (prods) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
        setProductos(JSON.parse(prods));
      } catch (e) {
        console.error(e);
      }
    }

    const comprs = localStorage.getItem("duna_compras");
    if (comprs) {
      try {
        setCompras(JSON.parse(comprs));
      } catch (e) {
        console.error(e);
      }
    }

    const cxpGuardado = localStorage.getItem("duna_cxp");
    if (cxpGuardado) {
      try {
        setCxp(JSON.parse(cxpGuardado));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Sincronización en tiempo real con Firestore (colección "duna_proveedores"); sin variables de entorno,
  // degrada suavemente a localStorage.
  useEffect(() => {
    return escucharColeccion("duna_proveedores", setProveedores);
  }, []);

  const actualizarProveedores = (nuevos) => {
    setProveedores(nuevos);
    nuevos.forEach((p) => {
      guardarDocumento("duna_proveedores", p.id, p).catch((e) => console.error(e));
    });
  };

  // --- Directorio de Proveedores ---

  const filtrarProveedores = (query) => {
    if (!query) return [];
    const q = query.toLowerCase();
    const qDigits = extraerDigitos(query);
    return proveedores.filter(p =>
      p.razonSocial.toLowerCase().includes(q) ||
      (p.documento || "").toLowerCase().includes(q) ||
      (qDigits.length >= 3 && extraerDigitos(p.documento).includes(qDigits))
    ).slice(0, 6);
  };

  const handleSeleccionarProveedor = (prov) => {
    setProveedorSeleccionado(prov);
    setFormCompra(prev => ({
      ...prev,
      condicion: prov.diasCredito === 0 ? "CONTADO" : "CREDITO",
      fechaVencimiento: calcularVencimiento(prev.fechaEmision, prov.diasCredito),
    }));
    setBusquedaProveedor("");
    setMostrarSugerenciasProveedor(false);
  };

  const handleQuitarProveedor = () => {
    setProveedorSeleccionado(null);
    setFormCompra(prev => ({ ...prev, condicion: "CREDITO", fechaVencimiento: "" }));
  };

  const abrirModalProveedor = () => {
    setFormProveedor(FORM_PROVEEDOR_INICIAL);
    setModalProveedorAbierto(true);
  };

  const handleGuardarProveedor = (e) => {
    e.preventDefault();
    if (!formProveedor.razonSocial.trim() || formProveedor.numeroDocumento.trim().length < 5) {
      alert("Indica la razón social y un número de documento válido.");
      return;
    }

    const documentoFinal = normalizarDocumentoProveedor(`${formProveedor.tipoDocumento}${formProveedor.numeroDocumento}`);
    const existente = proveedores.find(p => normalizarDocumentoProveedor(p.documento) === documentoFinal);

    const proveedorGuardado = {
      id: existente?.id || `prov_${Date.now()}`,
      documento: documentoFinal,
      razonSocial: formProveedor.razonSocial.trim(),
      contacto: formProveedor.contacto,
      telefono: formProveedor.telefono,
      direccion: formProveedor.direccion,
      diasCredito: Number(formProveedor.diasCredito),
      status: "ACTIVE",
    };

    const nuevos = existente
      ? proveedores.map(p => p === existente ? proveedorGuardado : p)
      : [proveedorGuardado, ...proveedores];
    actualizarProveedores(nuevos);
    handleSeleccionarProveedor(proveedorGuardado);
    setModalProveedorAbierto(false);
  };

  // --- Cabecera de la Compra ---

  const handleCambiarFechaEmision = (valor) => {
    setFormCompra(prev => ({
      ...prev,
      fechaEmision: valor,
      fechaVencimiento: calcularVencimiento(valor, proveedorSeleccionado?.diasCredito ?? 30),
    }));
  };

  // --- Renglones de Mercancía ---

  const productosFiltradosCombo = (busquedaProducto
    ? productos.filter(p =>
        p.name.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        p.code.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        (p.barcode || "").toLowerCase().includes(busquedaProducto.toLowerCase())
      )
    : productos
  ).slice(0, 8);

  const productoParaRenglon = productos.find(p => p.id === renglonActual.productoId) || null;
  const tieneVariantes = (productoParaRenglon?.variantes || []).length > 0;

  const handleSeleccionarProductoRenglon = (prod) => {
    setRenglonActual({ productoId: prod.id, varianteNombre: "", cantidad: 1, costoUnitario: prod.costo || "" });
    setBusquedaProducto(`${prod.code} - ${prod.name}`);
    setMostrarSugerenciasProducto(false);
  };

  const handleAgregarRenglon = () => {
    if (!renglonActual.productoId) {
      alert("Selecciona un producto del catálogo.");
      return;
    }
    if (tieneVariantes && !renglonActual.varianteNombre) {
      alert("Selecciona la variante a ingresar.");
      return;
    }
    const cantidad = Number(renglonActual.cantidad) || 0;
    const costoUnitario = Number(renglonActual.costoUnitario) || 0;
    if (cantidad <= 0) {
      alert("Indica una cantidad válida.");
      return;
    }

    const nuevoRenglon = {
      // eslint-disable-next-line react-hooks/purity -- id generado en un manejador de evento (click), no durante el render
      id: `rg_${Date.now()}_${renglones.length}`,
      productoId: renglonActual.productoId,
      productoNombre: productoParaRenglon.name,
      varianteNombre: renglonActual.varianteNombre,
      cantidad,
      costoUnitario,
      subtotal: cantidad * costoUnitario,
    };
    setRenglones(prev => [...prev, nuevoRenglon]);
    setRenglonActual(RENGLON_INICIAL);
    setBusquedaProducto("");
  };

  const handleEliminarRenglon = (id) => {
    setRenglones(prev => prev.filter(r => r.id !== id));
  };

  const totalCompraUsd = renglones.reduce((acc, r) => acc + r.subtotal, 0);

  // --- Registro de la Compra ---

  const handleRegistrarCompra = (e) => {
    e.preventDefault();
    if (!proveedorSeleccionado) {
      alert("Selecciona un proveedor.");
      return;
    }
    if (!formCompra.nroFactura.trim()) {
      alert("Indica el número de factura del proveedor.");
      return;
    }
    if (renglones.length === 0) {
      alert("Agrega al menos un renglón de mercancía.");
      return;
    }

    // Impacto en stock + Costo Promedio Ponderado (CPP), renglón por renglón y de forma acumulativa
    let productosActualizados = [...productos];
    renglones.forEach(r => {
      productosActualizados = productosActualizados.map(p => {
        if (p.id !== r.productoId) return p;

        const stockAnterior = Number(p.stock) || 0;
        const costoAnterior = Number(p.costo) || 0;
        const stockTotal = stockAnterior + r.cantidad;
        const costoPromedio = stockTotal > 0
          ? ((stockAnterior * costoAnterior) + (r.cantidad * r.costoUnitario)) / stockTotal
          : r.costoUnitario;

        if (r.varianteNombre && (p.variantes || []).length > 0) {
          const nuevasVariantes = p.variantes.map(v =>
            v.nombre === r.varianteNombre ? { ...v, stock: (Number(v.stock) || 0) + r.cantidad } : v
          );
          const nuevoStockProducto = nuevasVariantes.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
          return { ...p, variantes: nuevasVariantes, stock: nuevoStockProducto, costo: costoPromedio };
        }

        return { ...p, stock: stockTotal, costo: costoPromedio };
      });
    });
    setProductos(productosActualizados);
    localStorage.setItem("duna_productos", JSON.stringify(productosActualizados));

    const esContado = formCompra.condicion === "CONTADO";
    const totalUsd = totalCompraUsd;
    // eslint-disable-next-line react-hooks/purity -- id generado en un manejador de evento (submit), no durante el render
    const idCompra = `COMP-${Date.now().toString().slice(-6)}`;

    const nuevaCompra = {
      id: idCompra,
      fecha: new Date().toLocaleDateString("es-VE"),
      proveedorId: proveedorSeleccionado.id,
      documentoProveedor: proveedorSeleccionado.documento,
      razonSocial: proveedorSeleccionado.razonSocial,
      nroFactura: formCompra.nroFactura.trim(),
      nroControl: formCompra.nroControl.trim(),
      fechaEmision: formCompra.fechaEmision,
      fechaVencimiento: formCompra.fechaVencimiento,
      condicion: formCompra.condicion,
      totalUsd,
      status: esContado ? "PAGADA" : "PENDIENTE",
      renglones,
    };

    const nuevasCompras = [nuevaCompra, ...compras];
    setCompras(nuevasCompras);
    localStorage.setItem("duna_compras", JSON.stringify(nuevasCompras));

    const registroCxp = {
      id: idCompra,
      proveedorId: proveedorSeleccionado.id,
      documentoProveedor: proveedorSeleccionado.documento,
      razonSocial: proveedorSeleccionado.razonSocial,
      nroFactura: nuevaCompra.nroFactura,
      nroControl: nuevaCompra.nroControl,
      fechaEmision: nuevaCompra.fechaEmision,
      fechaVencimiento: nuevaCompra.fechaVencimiento,
      totalUsd,
      saldoPendienteUsd: esContado ? 0 : totalUsd,
      status: esContado ? "PAGADA" : "PENDIENTE",
    };
    const nuevasCxp = [registroCxp, ...cxp];
    setCxp(nuevasCxp);
    localStorage.setItem("duna_cxp", JSON.stringify(nuevasCxp));

    setProveedorSeleccionado(null);
    setFormCompra(FORM_COMPRA_INICIAL);
    setRenglones([]);
    setRenglonActual(RENGLON_INICIAL);
    setBusquedaProducto("");
    alert(`Compra ${idCompra} registrada. Stock y costo promedio actualizados.`);
  };

  const abrirModalDetalle = (compra) => {
    setCompraDetalleActual(compra);
    setModalDetalleAbierto(true);
  };

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
                <span className="text-[11px] bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full font-bold border border-amber-200">COMPRAS</span>
              </Link>
              <p className="text-[11px] text-slate-400 font-medium">Proveedores y Recepción de Mercancía</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-6">

        <form onSubmit={handleRegistrarCompra} className="space-y-6">

          {/* Proveedor */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
            <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-[#FE6712]" /> Proveedor
            </h2>

            {proveedorSeleccionado ? (
              <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-300 rounded-2xl px-4 py-3">
                <div className="min-w-0">
                  <span className="font-bold text-sm text-slate-800 block truncate">{proveedorSeleccionado.razonSocial}</span>
                  <span className="text-[11px] text-slate-500">
                    {proveedorSeleccionado.documento} • {proveedorSeleccionado.diasCredito === 0 ? "Contado" : `${proveedorSeleccionado.diasCredito} días de crédito`}
                  </span>
                </div>
                <button type="button" onClick={handleQuitarProveedor} className="text-[11px] font-bold text-slate-500 hover:text-[#FE6712] underline shrink-0">
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={busquedaProveedor}
                    onChange={(e) => { setBusquedaProveedor(e.target.value); setMostrarSugerenciasProveedor(true); }}
                    onFocus={() => setMostrarSugerenciasProveedor(true)}
                    onBlur={() => setTimeout(() => setMostrarSugerenciasProveedor(false), 150)}
                    placeholder="Buscar por RIF o razón social..."
                    autoComplete="off"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                  {mostrarSugerenciasProveedor && filtrarProveedores(busquedaProveedor).length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {filtrarProveedores(busquedaProveedor).map((p) => (
                        <button key={p.id} type="button" onMouseDown={() => handleSeleccionarProveedor(p)} className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-100 last:border-0">
                          <span className="font-bold text-slate-800 block text-xs">{p.razonSocial}</span>
                          <span className="text-[10px] text-slate-400">{p.documento} • {p.diasCredito === 0 ? "Contado" : `${p.diasCredito} días`}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={abrirModalProveedor}
                  className="px-4 py-2 bg-orange-50 hover:bg-[#FE6712] text-[#FE6712] hover:text-white border border-orange-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Nuevo Proveedor
                </button>
              </div>
            )}
          </div>

          {/* Cabecera fiscal */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#FE6712]" /> Datos Fiscales de la Factura
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Nº Factura Proveedor *</label>
                <input
                  type="text"
                  required
                  value={formCompra.nroFactura}
                  onChange={(e) => setFormCompra({ ...formCompra, nroFactura: e.target.value })}
                  placeholder="00012345"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Nº de Control Fiscal (SENIAT)</label>
                <input
                  type="text"
                  value={formCompra.nroControl}
                  onChange={(e) => setFormCompra({ ...formCompra, nroControl: e.target.value })}
                  placeholder="00-000123"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Fecha de Emisión *</label>
                <input
                  type="date"
                  required
                  value={formCompra.fechaEmision}
                  onChange={(e) => handleCambiarFechaEmision(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Fecha de Vencimiento (auto)</label>
                <input
                  type="date"
                  readOnly
                  value={formCompra.fechaVencimiento}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Condición</label>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setFormCompra({ ...formCompra, condicion: "CONTADO" })} className={pillClase(formCompra.condicion === "CONTADO")}>Contado</button>
                <button type="button" onClick={() => setFormCompra({ ...formCompra, condicion: "CREDITO" })} className={pillClase(formCompra.condicion === "CREDITO")}>Crédito</button>
              </div>
            </div>
          </div>

          {/* Renglones de mercancía */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-4 h-4 text-[#FE6712]" /> Detalle de Mercancía Recibida
            </h2>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={busquedaProducto}
                onChange={(e) => { setBusquedaProducto(e.target.value); setMostrarSugerenciasProducto(true); }}
                onFocus={() => setMostrarSugerenciasProducto(true)}
                onBlur={() => setTimeout(() => setMostrarSugerenciasProducto(false), 150)}
                placeholder="Buscar producto por nombre, SKU o código de barras..."
                autoComplete="off"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
              {mostrarSugerenciasProducto && productosFiltradosCombo.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {productosFiltradosCombo.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => handleSeleccionarProductoRenglon(p)}
                      className="w-full flex items-center gap-2.5 text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-100 last:border-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura dinámica (Base64/URL arbitraria), incompatible con next/image sin configurar dominios */}
                      <img src={p.image} alt="" className="w-8 h-8 rounded-lg object-cover bg-slate-100 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-slate-800 text-xs block truncate">{p.name}</span>
                        <span className="text-[10px] text-slate-400">{p.code} • Stock: {p.stock} • Costo: ${(p.costo || 0).toFixed(2)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {productoParaRenglon && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end bg-slate-50 border border-slate-200 rounded-2xl p-3">
                <div className="sm:col-span-4 text-[11px] font-bold text-slate-700">
                  Producto seleccionado: <span className="text-[#FE6712]">{productoParaRenglon.name}</span>
                </div>

                {tieneVariantes && (
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Variante *</label>
                    <select
                      required
                      value={renglonActual.varianteNombre}
                      onChange={(e) => setRenglonActual({ ...renglonActual, varianteNombre: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                    >
                      <option value="">Seleccionar...</option>
                      {productoParaRenglon.variantes.map(v => (
                        <option key={v.nombre} value={v.nombre}>{v.nombre} (Stock: {v.stock})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={renglonActual.cantidad}
                    onChange={(e) => setRenglonActual({ ...renglonActual, cantidad: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Costo Unitario ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={renglonActual.costoUnitario}
                    onChange={(e) => setRenglonActual({ ...renglonActual, costoUnitario: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleAgregarRenglon}
                    className="w-full px-3 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar Renglón
                  </button>
                </div>
              </div>
            )}

            {renglones.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Producto</th>
                      <th className="p-3">Cantidad</th>
                      <th className="p-3">Costo Unit.</th>
                      <th className="p-3">Subtotal</th>
                      <th className="p-3 text-right">Quitar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {renglones.map(r => (
                      <tr key={r.id}>
                        <td className="p-3 font-bold text-slate-800">
                          {r.productoNombre}{r.varianteNombre ? ` (${r.varianteNombre})` : ""}
                        </td>
                        <td className="p-3 text-slate-600">{r.cantidad}</td>
                        <td className="p-3 text-slate-600">${r.costoUnitario.toFixed(2)}</td>
                        <td className="p-3 font-black text-slate-900">${r.subtotal.toFixed(2)}</td>
                        <td className="p-3 text-right">
                          <button type="button" onClick={() => handleEliminarRenglon(r.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-end gap-4 px-4 py-3 bg-slate-50 border-t border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500">Total Compra</span>
                  <span className="text-lg font-black text-slate-900">${totalCompraUsd.toFixed(2)}</span>
                  <span className="text-xs font-bold text-emerald-600">Bs. {formatearBs(totalCompraUsd, tasaBcv)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-3 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition flex items-center gap-2 shadow-sm shadow-orange-500/20"
            >
              <Check className="w-4 h-4" /> Registrar Compra
            </button>
          </div>
        </form>

        {/* Histórico de Compras */}
        <div className="pt-4">
          <h2 className="text-sm font-extrabold text-slate-900 mb-3 uppercase tracking-wider">Compras Realizadas</h2>
          {compras.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center text-xs text-slate-400">
              Aún no se han registrado compras a proveedores.
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-4">Fecha</th>
                      <th className="p-4">Nº Factura</th>
                      <th className="p-4">Proveedor</th>
                      <th className="p-4">RIF</th>
                      <th className="p-4">Total</th>
                      <th className="p-4">Condición</th>
                      <th className="p-4">Estado</th>
                      <th className="p-4 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {compras.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition">
                        <td className="p-4 text-slate-600">{c.fecha}</td>
                        <td className="p-4 font-black text-slate-900">{c.nroFactura}</td>
                        <td className="p-4 font-bold text-slate-800">{c.razonSocial}</td>
                        <td className="p-4 text-slate-500">{c.documentoProveedor}</td>
                        <td className="p-4">
                          <span className="font-black text-slate-900 block">${c.totalUsd.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-400">Bs. {formatearBs(c.totalUsd, tasaBcv)}</span>
                        </td>
                        <td className="p-4 text-slate-600">{c.condicion === "CONTADO" ? "Contado" : "Crédito"}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                            c.status === "PAGADA"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            type="button"
                            onClick={() => abrirModalDetalle(c)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-orange-50 text-slate-600 hover:text-[#FE6712] border border-slate-200 rounded-xl font-bold text-[11px] transition"
                          >
                            Ver Detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal Nuevo Proveedor */}
      {modalProveedorAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900">Nuevo Proveedor</h3>
              <button onClick={() => setModalProveedorAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGuardarProveedor} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Documento Fiscal *</label>
                <div className="flex items-stretch border border-slate-200 rounded-xl overflow-hidden bg-slate-50 focus-within:border-[#FE6712]">
                  <select
                    value={formProveedor.tipoDocumento}
                    onChange={(e) => setFormProveedor({ ...formProveedor, tipoDocumento: e.target.value })}
                    className="px-2 bg-black/5 border-r border-slate-200 text-xs font-bold text-slate-700 focus:outline-none"
                  >
                    {TIPOS_DOCUMENTO_PROVEEDOR.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    minLength={5}
                    value={formProveedor.numeroDocumento}
                    onChange={(e) => setFormProveedor({ ...formProveedor, numeroDocumento: extraerDigitos(e.target.value) })}
                    placeholder="12345678"
                    className="flex-1 min-w-0 px-3 py-2 bg-transparent text-xs text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Razón Social *</label>
                <input
                  type="text"
                  required
                  value={formProveedor.razonSocial}
                  onChange={(e) => setFormProveedor({ ...formProveedor, razonSocial: e.target.value })}
                  placeholder="Distribuidora Ejemplo, C.A."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Contacto</label>
                  <input
                    type="text"
                    value={formProveedor.contacto}
                    onChange={(e) => setFormProveedor({ ...formProveedor, contacto: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={formProveedor.telefono}
                    onChange={(e) => setFormProveedor({ ...formProveedor, telefono: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Dirección</label>
                <input
                  type="text"
                  value={formProveedor.direccion}
                  onChange={(e) => setFormProveedor({ ...formProveedor, direccion: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Días de Crédito</label>
                <select
                  value={formProveedor.diasCredito}
                  onChange={(e) => setFormProveedor({ ...formProveedor, diasCredito: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                >
                  {OPCIONES_DIAS_CREDITO.map(d => (
                    <option key={d} value={d}>{d === 0 ? "0 (Contado)" : `${d} días`}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalProveedorAbierto(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
                  <Check className="w-4 h-4" /> Guardar Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalle de Compra */}
      {modalDetalleAbierto && compraDetalleActual && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Detalle de Compra {compraDetalleActual.id}</h3>
                <p className="text-xs text-slate-400">{compraDetalleActual.razonSocial} • Factura {compraDetalleActual.nroFactura}</p>
              </div>
              <button onClick={() => setModalDetalleAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Producto</th>
                    <th className="p-3">Cant.</th>
                    <th className="p-3">Costo Unit.</th>
                    <th className="p-3">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(compraDetalleActual.renglones || []).map((r) => (
                    <tr key={r.id}>
                      <td className="p-3 font-bold text-slate-800">
                        {r.productoNombre}{r.varianteNombre ? ` (${r.varianteNombre})` : ""}
                      </td>
                      <td className="p-3 text-slate-600">{r.cantidad}</td>
                      <td className="p-3 text-slate-600">${r.costoUnitario.toFixed(2)}</td>
                      <td className="p-3 font-black text-slate-900">${r.subtotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-end gap-4 px-4 py-3 bg-slate-50 border-t border-slate-200">
                <span className="text-[11px] font-bold text-slate-500">Total</span>
                <span className="text-lg font-black text-slate-900">${compraDetalleActual.totalUsd.toFixed(2)}</span>
                <span className="text-xs font-bold text-emerald-600">Bs. {formatearBs(compraDetalleActual.totalUsd, tasaBcv)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setModalDetalleAbierto(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

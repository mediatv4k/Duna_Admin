"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ArrowLeft, Search, Plus, UserPlus, Check, X, 
  Receipt, Wallet, AlertCircle, Trash2, DollarSign
} from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";

export default function CXCPage() {
  const { modoMoneda, tasaBcv } = useCurrency();

  const [cuentas, setCuentas] = useState([]);
  const [productosInventario, setProductosInventario] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [modalVentaAbierto, setModalVentaAbierto] = useState(false);

  // Formulario de Nueva Venta / Factura
  const [formVenta, setFormVenta] = useState({
    cliente: "",
    telefono: "",
    documento: "",
    productoId: "",
    cantidad: 1,
    precioUnitario: 0,
    montoTotal: 0,
    montoAbonado: 0,
    nota: ""
  });

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

    const prods = localStorage.getItem("duna_inventario_prods");
    if (prods) {
      try {
        setProductosInventario(JSON.parse(prods));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const actualizarCuentas = (nuevas) => {
    setCuentas(nuevas);
    localStorage.setItem("duna_cxc_records", JSON.stringify(nuevas));
  };

  // Manejar selección de producto para autorellenar precio
  const handleSeleccionarProducto = (prodId) => {
    const prod = productosInventario.find(p => p.id === prodId);
    if (prod) {
      const cant = Number(formVenta.cantidad) || 1;
      setFormVenta(prev => ({
        ...prev,
        productoId: prodId,
        precioUnitario: prod.price,
        montoTotal: prod.price * cant
      }));
    }
  };

  // Recalcular total cuando cambia la cantidad
  const handleCambiarCantidad = (cant) => {
    const c = Number(cant) || 1;
    setFormVenta(prev => ({
      ...prev,
      cantidad: c,
      montoTotal: prev.precioUnitario * c
    }));
  };

  // Guardar Venta y registrar cuenta por cobrar
  const handleCrearVenta = (e) => {
    e.preventDefault();
    if (!formVenta.cliente || formVenta.montoTotal <= 0) {
      alert("Indica el cliente y un monto válido.");
      return;
    }

    const abonado = Number(formVenta.montoAbonado) || 0;
    const saldoPendiente = Math.max(0, formVenta.montoTotal - abonado);
    const estado = saldoPendiente === 0 ? "PAGADO" : abonado > 0 ? "PARCIAL" : "PENDIENTE";

    const nuevaCuenta = {
      id: `FAC-${Date.now().toString().slice(-6)}`,
      fecha: new Date().toLocaleDateString("es-VE"),
      cliente: formVenta.cliente,
      telefono: formVenta.telefono || "S/N",
      documento: formVenta.documento || "S/D",
      productoNombre: productosInventario.find(p => p.id === formVenta.productoId)?.name || "Venta General",
      cantidad: formVenta.cantidad,
      total: formVenta.montoTotal,
      abonado: abonado,
      saldo: saldoPendiente,
      estado: estado
    };

    // Descontar inventario si el producto existe
    if (formVenta.productoId) {
      const actualizados = productosInventario.map(p => {
        if (p.id === formVenta.productoId) {
          return { ...p, stock: Math.max(0, p.stock - formVenta.cantidad) };
        }
        return p;
      });
      setProductosInventario(actualizados);
      localStorage.setItem("duna_inventario_prods", JSON.stringify(actualizados));
    }

    actualizarCuentas([nuevaCuenta, ...cuentas]);
    setModalVentaAbierto(false);
  };

  // Registrar abono rápido a una factura pendiente
  const handleAbonar = (id) => {
    const cuenta = cuentas.find(c => c.id === id);
    if (!cuenta || cuenta.saldo <= 0) return;

    const montoStr = prompt(`Saldo pendiente: $${cuenta.saldo.toFixed(2)}. Ingrese el monto en USD a abonar:`);
    const monto = Number(montoStr);

    if (monto && monto > 0) {
      const nuevoAbonado = cuenta.abonado + monto;
      const nuevoSaldo = Math.max(0, cuenta.total - nuevoAbonado);
      const nuevoEstado = nuevoSaldo === 0 ? "PAGADO" : "PARCIAL";

      const actualizadas = cuentas.map(c => {
        if (c.id === id) {
          return { ...c, abonado: nuevoAbonado, saldo: nuevoSaldo, estado: nuevoEstado };
        }
        return c;
      });
      actualizarCuentas(actualizadas);
    }
  };

  const handleEliminarCuenta = (id) => {
    if (confirm("¿Seguro que deseas eliminar este registro?")) {
      actualizarCuentas(cuentas.filter(c => c.id !== id));
    }
  };

  // Totales
  const totalPorCobrarUsd = cuentas.reduce((acc, c) => acc + c.saldo, 0);
  const totalCobradoUsd = cuentas.reduce((acc, c) => acc + c.abonado, 0);

  const formatearMonto = (montoUsd) => {
    const bcv = (montoUsd * tasaBcv).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (modoMoneda === "usd") return `$${montoUsd.toFixed(2)}`;
    if (modoMoneda === "ves") return `Bs. ${bcv}`;
    return `$${montoUsd.toFixed(2)} / Bs. ${bcv}`;
  };

  const cuentasFiltradas = cuentas.filter(c =>
    c.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.id.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.documento.toLowerCase().includes(busqueda.toLowerCase())
  );

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
                <img src="/logo-duna-admin.png" alt="D'una Admin" className="h-8 w-auto object-contain" />
                <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">VENTAS & CXC</span>
              </Link>
              <p className="text-[11px] text-slate-400 font-medium">Facturación a Crédito y Control de Cobranzas</p>
            </div>
          </div>

          <button
            onClick={() => setModalVentaAbierto(true)}
            className="px-4 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition flex items-center gap-2 shadow-sm shadow-orange-500/20"
          >
            <Plus className="w-4 h-4" /> Nueva Venta / Factura
          </button>
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
            <span className="text-xs font-bold text-slate-400">Facturas Registradas</span>
            <div className="text-2xl font-black text-slate-900 mt-2">{cuentas.length}</div>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">Documentos comerciales</p>
          </div>
        </div>

        {/* Buscador */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
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

        {/* Tabla de Cuentas */}
        {cuentas.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm my-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Receipt className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Sin facturas ni deudas</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Registra ventas a crédito o al contado para llevar el control de cobranzas y clientes.
              </p>
            </div>
            <button
              onClick={() => setModalVentaAbierto(true)}
              className="px-5 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition inline-flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Crear Primera Factura
            </button>
          </div>
        ) : (
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
                      </td>
                      <td className="p-4">
                        <span className="font-bold text-slate-800 block">{c.cliente}</span>
                        <span className="text-[11px] text-slate-400">{c.documento} • {c.telefono}</span>
                      </td>
                      <td className="p-4 text-slate-600">
                        {c.productoNombre} (x{c.cantidad})
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
                          {c.saldo > 0 && (
                            <button
                              onClick={() => handleAbonar(c.id)}
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
        )}
      </main>

      {/* Modal Nueva Factura */}
      {modalVentaAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-200">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Registrar Venta / Factura</h3>
                <p className="text-xs text-slate-400">Emisión al contado o a crédito con descuento de stock</p>
              </div>
              <button onClick={() => setModalVentaAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCrearVenta} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Nombre del Cliente *</label>
                  <input
                    type="text"
                    required
                    value={formVenta.cliente}
                    onChange={(e) => setFormVenta({ ...formVenta, cliente: e.target.value })}
                    placeholder="Ej: Inversiones ABC"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Cédula / RIF</label>
                  <input
                    type="text"
                    value={formVenta.documento}
                    onChange={(e) => setFormVenta({ ...formVenta, documento: e.target.value })}
                    placeholder="J-12345678-0"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Producto del Catálogo</label>
                <select
                  value={formVenta.productoId}
                  onChange={(e) => handleSeleccionarProducto(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                >
                  <option value="">Seleccionar artículo...</option>
                  {productosInventario.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} - ${p.price.toFixed(2)} (Stock: {p.stock})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={formVenta.cantidad}
                    onChange={(e) => handleCambiarCantidad(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Total ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formVenta.montoTotal}
                    onChange={(e) => setFormVenta({ ...formVenta, montoTotal: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Abono Inicial ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formVenta.montoAbonado}
                    onChange={(e) => setFormVenta({ ...formVenta, montoAbonado: Number(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalVentaAbierto(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-orange-500/20"
                >
                  <Check className="w-4 h-4" /> Registrar Factura
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
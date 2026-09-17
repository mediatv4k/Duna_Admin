"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Receipt, ShoppingCart, Boxes, PlusCircle,
  Wallet, Truck, CheckCircle2, Sparkles
} from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";

export default function Home() {
  const { modoMoneda, tasaBcv } = useCurrency();

  const [kpis, setKpis] = useState({
    porCobrar: 0,
    clientesConSaldo: 0,
    porPagar: 0,
    proveedoresPendientes: 0,
    cobradoEfectivo: 0,
    inventarioTotal: 0,
    articulosRegistrados: 0,
  });

  useEffect(() => {
    try {
      const cuentas = JSON.parse(localStorage.getItem("duna_cxc_records") || "[]");
      const productos = JSON.parse(localStorage.getItem("duna_inventario_prods") || "[]");
      const cxp = JSON.parse(localStorage.getItem("duna_cxp") || "[]");
      const cxpPendientes = cxp.filter(c => (c.saldoPendienteUsd || 0) > 0);

      // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
      setKpis({
        porCobrar: cuentas.reduce((acc, c) => acc + (c.saldo || 0), 0),
        clientesConSaldo: cuentas.filter(c => (c.saldo || 0) > 0).length,
        porPagar: cxpPendientes.reduce((acc, c) => acc + (c.saldoPendienteUsd || 0), 0),
        proveedoresPendientes: new Set(cxpPendientes.map(c => c.proveedorId)).size,
        cobradoEfectivo: cuentas.reduce((acc, c) => acc + (c.abonado || 0), 0),
        inventarioTotal: productos.reduce((acc, p) => acc + (p.price || 0) * (p.stock || 0), 0),
        articulosRegistrados: productos.length,
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const formatearMonto = (montoUsd) => {
    const bcv = (montoUsd * tasaBcv).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (modoMoneda === "usd") return `$${montoUsd.toFixed(2)}`;
    if (modoMoneda === "ves") return `Bs. ${bcv}`;
    return `$${montoUsd.toFixed(2)} / Bs. ${bcv}`;
  };

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col font-sans">
      
      {/* Navbar D'una Marketplace */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- logo local pequeño, no requiere optimización de next/image */}
              <img src="/logo-duna-admin.png" alt="D'una Admin" className="h-8 w-auto object-contain" />
              <span className="text-[11px] bg-orange-50 text-[#FE6712] px-2.5 py-0.5 rounded-full font-bold border border-orange-200">ADMIN</span>
            </Link>
            <p className="text-[11px] text-slate-400 font-medium hidden sm:block">Plataforma de Gestión Comercial</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200/60 text-xs font-bold text-[#FE6712]">
              <span className="w-2 h-2 rounded-full bg-[#FE6712] animate-pulse"></span>
              <span className="hidden sm:inline">Lienzo en Blanco (SaaS)</span>
            </div>
          </div>
        </div>
      </header>

      {/* Contenedor Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        
        {/* Banner Hero Blanco */}
        <div className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-10 shadow-sm relative overflow-hidden">
          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-[#FE6712] border border-orange-100 text-xs font-extrabold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>SISTEMA ADMINISTRATIVO MULTI-TIENDA</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900">
              Todo el control de tu negocio en un solo lugar
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
              Facturación a crédito (CXC), compras a proveedores (CXP) e inventario con cálculo automático de stock. Todo listo para empezar a registrar.
            </p>
          </div>
          <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-orange-500/5 rounded-full blur-3xl pointer-events-none"></div>
        </div>

        {/* Tarjetas de Indicadores (Saldos en $0.00) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">
              <span>Por Cobrar (CXC)</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">{formatearMonto(kpis.porCobrar)}</div>
            <div className="text-xs text-slate-400 mt-1 font-medium">{kpis.clientesConSaldo} clientes con saldo</div>
          </div>

          <Link href="/cxp" className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-rose-300 transition block">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">
              <span>Por Pagar (CXP)</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">{formatearMonto(kpis.porPagar)}</div>
            <div className="text-xs text-slate-400 mt-1 font-medium">{kpis.proveedoresPendientes} proveedores pendientes</div>
          </Link>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">
              <span>Cobrado Efectivo</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">{formatearMonto(kpis.cobradoEfectivo)}</div>
            <div className="text-xs text-slate-400 mt-1 font-medium">Total recaudado</div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">
              <span>Inventario Total</span>
              <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#FE6712] flex items-center justify-center">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">{formatearMonto(kpis.inventarioTotal)}</div>
            <div className="text-xs text-slate-400 mt-1 font-medium">{kpis.articulosRegistrados} artículos registrados</div>
          </div>
        </div>

        {/* 3 Módulos Principales tipo Tarjetas D'una */}
        <div>
          <h2 className="text-sm font-extrabold text-slate-900 mb-4 uppercase tracking-wider">
            Módulos del Sistema
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Módulo CXC */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 hover:border-emerald-500 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold text-emerald-600 uppercase tracking-wider">Módulo 1</span>
                  <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-emerald-700 transition mt-1">Ventas & Cuentas por Cobrar</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Factura a crédito, gestiona teléfonos de clientes, monitorea vencimientos y abonos parciales.
                  </p>
                </div>
              </div>
              <Link href="/cxc">
              <button className="mt-6 w-full py-3 bg-slate-50 hover:bg-emerald-600 text-slate-700 hover:text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-200 hover:border-transparent">
                <PlusCircle className="w-4 h-4" /> Registrar Primera Venta
              </button>
              </Link>
            </div>

            {/* Módulo CXP */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 hover:border-rose-500 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold text-rose-600 uppercase tracking-wider">Módulo 2</span>
                  <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-rose-700 transition mt-1">Compras & Cuentas por Pagar</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Registra compras a proveedores, comprobantes de pago, fechas de liquidación y deudas pendientes.
                  </p>
                </div>
              </div>
              <Link href="/compras">
              <button className="mt-6 w-full py-3 bg-slate-50 hover:bg-rose-600 text-slate-700 hover:text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-200 hover:border-transparent">
                <PlusCircle className="w-4 h-4" /> Registrar Compra
              </button>
              </Link>
            </div>

            {/* Módulo Inventario */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 hover:border-[#FE6712] shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#FE6712] flex items-center justify-center group-hover:bg-[#FE6712] group-hover:text-white transition">
                  <Boxes className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold text-[#FE6712] uppercase tracking-wider">Módulo 3</span>
                  <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-[#FE6712] transition mt-1">Inventario & Productos</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Controla catálogo, precios de costo y venta, entradas, salidas y existencias en tiempo real.
                  </p>
                </div>
              </div>
              <Link href="/inventario">
              <button className="mt-6 w-full py-3 bg-slate-50 hover:bg-[#FE6712] text-slate-700 hover:text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-200 hover:border-transparent">
                <PlusCircle className="w-4 h-4" /> Agregar Primer Producto
              </button>
              </Link>
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}

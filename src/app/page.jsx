"use client";
import React from "react";
import Link from "next/link";
import {
  Receipt, ShoppingCart, Boxes, PlusCircle, Zap
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col font-sans">
      
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

        {/* Lanzador de Módulos del Sistema (sin cifras financieras) */}
        <div className="mt-4">
          <h2 className="text-sm font-extrabold text-slate-900 mb-4 uppercase tracking-wider">
            Módulos del Sistema
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

            {/* Módulo Terminal POS */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 hover:border-sky-500 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold text-sky-600 uppercase tracking-wider">Módulo 1</span>
                  <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-sky-700 transition mt-1">Terminal POS</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Mostrador de facturación rápida: código de barras, ticket permanente y cobro con Pago Móvil o tarjeta.
                  </p>
                </div>
              </div>
              <Link href="/pos">
              <button className="mt-6 w-full py-3 bg-slate-50 hover:bg-sky-600 text-slate-700 hover:text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-200 hover:border-transparent">
                <PlusCircle className="w-4 h-4" /> Abrir Terminal POS
              </button>
              </Link>
            </div>

            {/* Módulo CXC */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 hover:border-emerald-500 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold text-emerald-600 uppercase tracking-wider">Módulo 2</span>
                  <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-emerald-700 transition mt-1">Ventas & Cuentas por Cobrar</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Factura a crédito, gestiona teléfonos de clientes, monitorea vencimientos y abonos parciales.
                  </p>
                </div>
              </div>
              <Link href="/cxc">
              <button className="mt-6 w-full py-3 bg-slate-50 hover:bg-emerald-600 text-slate-700 hover:text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-200 hover:border-transparent">
                <PlusCircle className="w-4 h-4" /> Ir a Cuentas por Cobrar
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
                  <span className="text-[11px] font-extrabold text-rose-600 uppercase tracking-wider">Módulo 3</span>
                  <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-rose-700 transition mt-1">Compras & Cuentas por Pagar</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Registra compras a proveedores, comprobantes de pago, fechas de liquidación y deudas pendientes.
                  </p>
                </div>
              </div>
              <Link href="/compras">
              <button className="mt-6 w-full py-3 bg-slate-50 hover:bg-rose-600 text-slate-700 hover:text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-200 hover:border-transparent">
                <PlusCircle className="w-4 h-4" /> Ir a Cuentas por Pagar
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
                  <span className="text-[11px] font-extrabold text-[#FE6712] uppercase tracking-wider">Módulo 4</span>
                  <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-[#FE6712] transition mt-1">Inventario & Productos</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Controla catálogo, precios de costo y venta, entradas, salidas y existencias en tiempo real.
                  </p>
                </div>
              </div>
              <Link href="/inventario">
              <button className="mt-6 w-full py-3 bg-slate-50 hover:bg-[#FE6712] text-slate-700 hover:text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-200 hover:border-transparent">
                <PlusCircle className="w-4 h-4" /> Ir a Inventario
              </button>
              </Link>
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}

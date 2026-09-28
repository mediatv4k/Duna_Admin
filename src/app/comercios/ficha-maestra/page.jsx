"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { obtenerTokenComercio, obtenerUsuarioComercio } from "@/lib/commerceServices";
import SidebarTienda from "@/components/comercios/SidebarTienda";
import SelectorFichaMaestra from "@/components/comercios/SelectorFichaMaestra";

// ==============================================================================
// DEMOSTRACIÓN — SIN CONEXIÓN A ADONIS
// ==============================================================================
// Este esquema de metadata (esFichaMaestra/presentaciones/sabores/controlStock) es una PROPUESTA
// diseñada en esta sesión, no un contrato confirmado contra el backend real: no existe hoy ningún
// producto en Adonis con esta forma, ni ningún endpoint para ajustar stock por delta
// (/product/:id/stock/ajustar, también solo propuesto). Esta página demuestra el componente
// SelectorFichaMaestra (la parte que sí es responsabilidad del frontend) contra dos productos de
// ejemplo — uno con control de stock estricto y otro con stock ilimitado — para que se pueda probar
// la máquina de estados (conteo exacto, orden de agotados, alerta de stock bajo) antes de que el
// backend exista de verdad. onConfirmar no hace ninguna llamada de red: solo muestra el JSON de lo
// que se seleccionó.
const PRODUCTOS_DEMO = [
  {
    id: "H001",
    code: "H001",
    name: "Papaíto Helado",
    metadata: {
      esFichaMaestra: true,
      controlStock: true,
      sabores: {
        "H001-SABOR-CHOCOLATE": { nombre: "Chocolate", status: "ACTIVE", stock: 42 },
        "H001-SABOR-FRESA": { nombre: "Fresa", status: "ACTIVE", stock: 0 },
        "H001-SABOR-VAINILLA": { nombre: "Vainilla", status: "INACTIVE", stock: 15 },
        "H001-SABOR-RON_PASAS": { nombre: "Ron con Pasas", status: "ACTIVE", stock: 3 },
        "H001-SABOR-COCO": { nombre: "Coco", status: "ACTIVE", stock: 20 },
        "H001-SABOR-PARCHITA": { nombre: "Parchita", status: "ACTIVE", stock: 11 },
      },
      presentaciones: [
        { id: "H001-006", nombre: "Pack de 6 Unidades", price: 3.65, cantidadSabores: 6 },
        { id: "H001-015", nombre: "Pack de 15 Unidades", price: 8.2, cantidadSabores: 15 },
      ],
    },
  },
  {
    id: "P002",
    code: "P002",
    name: "Pastelitos Artesanales (bajo demanda)",
    metadata: {
      esFichaMaestra: true,
      controlStock: false,
      sabores: {
        "P002-SABOR-CARNE": { nombre: "Carne Mechada", status: "ACTIVE", stock: 0 },
        "P002-SABOR-QUESO": { nombre: "Queso", status: "ACTIVE", stock: 0 },
        "P002-SABOR-POLLO": { nombre: "Pollo", status: "ACTIVE", stock: 0 },
        "P002-SABOR-DULCE": { nombre: "Dulce (fuera de temporada)", status: "INACTIVE", stock: 0 },
      },
      presentaciones: [{ id: "P002-004", nombre: "Docena (4 sabores x 3)", price: 6.0, cantidadSabores: 4 }],
    },
  },
];

export default function FichaMaestraDemoPage() {
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

  const [ultimaSeleccion, setUltimaSeleccion] = useState(null);

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

      <div className="flex-1 min-h-screen bg-white text-slate-800 font-sans">
        <header className="h-16 border-b border-slate-100 bg-white/95 backdrop-blur sticky top-0 z-30 flex items-center px-6 sm:px-8 gap-2">
          <div>
            <span className="text-sm font-black text-slate-900">Ficha Maestra</span>
            <span className="ml-2 text-[11px] bg-orange-50 text-[#FE6712] px-2.5 py-0.5 rounded-full font-bold border border-orange-200">DEMO</span>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-800">
            Esquema propuesto, sin confirmar contra Adonis. Los dos productos de abajo son datos de ejemplo
            fijos en este archivo. Confirmar la selección no llama a ningún endpoint — no existe todavía
            ninguno para esto.
          </div>

          {PRODUCTOS_DEMO.map((producto) => (
            <div key={producto.id} className="rounded-xl bg-white shadow-sm border border-gray-100 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900">{producto.name}</h2>
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  {producto.metadata.controlStock ? "Inventario estricto" : "Bajo demanda (stock ilimitado)"}
                </span>
              </div>
              <SelectorFichaMaestra
                producto={producto}
                onConfirmar={(seleccion) => setUltimaSeleccion({ productoId: producto.id, ...seleccion })}
              />
            </div>
          ))}

          {ultimaSeleccion && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-[11px] font-bold text-slate-500 mb-1">Última selección confirmada (solo en pantalla, sin red):</p>
              <pre className="text-[11px] font-mono text-slate-700 overflow-auto">{JSON.stringify(ultimaSeleccion, null, 2)}</pre>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

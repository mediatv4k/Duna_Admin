"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { obtenerUsuarioComercio, esVendedorComercio } from "@/lib/commerceServices";

// Menú de navegación del Portal de Aliados Comerciales, con visibilidad según rol (RBAC).
// ADMIN / DUEÑO: ve todo. VENDEDOR / CAJERO: solo Mostrador, Pedidos (aún no implementado) y Cierre de Caja.
// Ocultar un enlace aquí es solo una ayuda visual: la restricción real vive en cada página (ver la guardia
// de esVendedorComercio en comercios/productos/page.jsx y en el Dashboard Ejecutivo /reportes).
const ITEMS_ADMIN = [
  { id: "kardex", href: "/comercios/productos", label: "Kardex" },
  { id: "mostrador", href: "/comercios/mostrador", label: "Mostrador" },
  // "Reportes" es el Dashboard Ejecutivo Financiero del ERP interno (/reportes), con su propia sesión
  // (AuthContext/Firebase), separada de la sesión de este portal (iac_store/ud_store). Un comercio sin
  // sesión abierta en el ERP interno verá el login de ese sistema, no este portal, al hacer clic aquí.
  { id: "reportes", href: "/reportes", label: "Reportes" },
  { id: "cierreCaja", href: "/comercios/cierre-caja", label: "Cierre de Caja" },
];

const ITEMS_VENDEDOR = [
  { id: "mostrador", href: "/comercios/mostrador", label: "Control de Mostrador" },
  // No existe todavía ninguna vista de gestión de pedidos en este portal; se deja visible pero
  // deshabilitado en vez de enlazar a una ruta inexistente o inventar el módulo dentro de esta tarea.
  { id: "pedidos", href: null, label: "Pedidos" },
  { id: "cierreCaja", href: "/comercios/cierre-caja", label: "Cierre de Caja" },
];

export default function MenuComercio({ activo }) {
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
    setUsuario(obtenerUsuarioComercio());
  }, []);

  const vendedor = esVendedorComercio(usuario);
  const items = vendedor ? ITEMS_VENDEDOR : ITEMS_ADMIN;

  return (
    <nav className="border-b border-slate-100 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-2 flex flex-wrap gap-1.5">
        {items.map((it) =>
          it.href ? (
            <Link
              key={it.id}
              href={it.href}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                activo === it.id ? "bg-[#FE6712] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {it.label}
            </Link>
          ) : (
            <span key={it.id} title="Aún no implementado" className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 cursor-not-allowed">
              {it.label}
            </span>
          )
        )}
      </div>
    </nav>
  );
}

"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Settings, Boxes, ClipboardList, Megaphone, Clock, LogOut, MonitorPlay, BarChart3, Wallet } from "lucide-react";
import { cerrarSesionComercio, obtenerUsuarioComercio, esVendedorComercio } from "@/lib/commerceServices";

// Sidebar interno de la gestión de una tienda específica del Portal de Aliados Comerciales (rediseño
// premium). Componente nuevo y aislado: no altera ningún layout maestro ni sidebar del ERP interno — solo
// lo usan las páginas de /comercios/* que explícitamente lo importan.
// "Pedidos", "Promociones" y "Horario" no tienen todavía ninguna vista real en este repositorio: se
// muestran deshabilitados (sin href) en vez de enlazar a una ruta inexistente o fabricar el módulo aquí.

const ITEMS_ADMIN = [
  { id: "configuracion", href: "/comercios/configuracion", label: "Configuración", icono: Settings },
  { id: "kardex", href: "/comercios/productos", label: "Kardex", icono: Boxes },
  { id: "mostrador", href: "/comercios/mostrador", label: "Mostrador", icono: MonitorPlay },
  { id: "reportes", href: "/reportes", label: "Reportes", icono: BarChart3 },
  { id: "pedidos", href: null, label: "Pedidos", icono: ClipboardList },
  { id: "cierreCaja", href: "/comercios/cierre-caja", label: "Cierre de Caja", icono: Wallet },
  { id: "promociones", href: null, label: "Promociones", icono: Megaphone },
  { id: "horario", href: null, label: "Horario", icono: Clock },
];

const ITEMS_VENDEDOR = [
  { id: "mostrador", href: "/comercios/mostrador", label: "Control de Mostrador", icono: MonitorPlay },
  { id: "pedidos", href: null, label: "Pedidos", icono: ClipboardList },
  { id: "cierreCaja", href: "/comercios/cierre-caja", label: "Cierre de Caja", icono: Wallet },
];

export default function SidebarTienda({ nombreComercio, storeId, selectorTienda }) {
  const pathname = usePathname();
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage
    setUsuario(obtenerUsuarioComercio());
  }, []);

  const handleCerrarSesion = () => {
    cerrarSesionComercio();
    router.replace("/comercios/login");
  };

  const vendedor = esVendedorComercio(usuario);
  const items = vendedor ? ITEMS_VENDEDOR : ITEMS_ADMIN;

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-white border-r border-slate-100 flex flex-col font-sans">
      <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-100 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-[#FE6712] text-white flex items-center justify-center font-black text-sm shrink-0">D&apos;</div>
        <span className="text-sm font-black text-slate-900 truncate">Portal de Aliados</span>
      </div>

      {selectorTienda && <div className="px-4 pt-4 shrink-0">{selectorTienda}</div>}

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((it) => {
          const Icono = it.icono;
          if (!it.href) {
            return (
              <span
                key={it.id}
                title="Aún no implementado"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-300 cursor-not-allowed"
              >
                <Icono className="w-4 h-4 shrink-0" /> {it.label}
              </span>
            );
          }
          const activo = pathname?.startsWith(it.href) || pathname === it.href;
          return (
            <Link
              key={it.id}
              href={it.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold transition ${
                activo ? "bg-[#FE6712] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icono className="w-4 h-4 shrink-0" /> {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-100 shrink-0">
        <div className="px-3 py-2 mb-1">
          <p className="text-[11px] font-bold text-slate-700 truncate">{nombreComercio || "Comercio"}</p>
          <p className="text-[10px] text-slate-400">Tienda #{storeId ?? "—"}</p>
        </div>
        <button
          type="button"
          onClick={handleCerrarSesion}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
        >
          <LogOut className="w-4 h-4 shrink-0" /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

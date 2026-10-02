"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2, Lock, ArrowLeft, Search, MoreVertical, LogIn, Power, Pencil, Check, X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import SidebarTienda from "@/components/comercios/SidebarTienda";
import ConfiguracionGastronomica from "@/components/comercios/ConfiguracionGastronomica";

// ==============================================================================
// MASTER DE TIENDAS — DATOS DE EJEMPLO, SIN CONECTAR A ADONIS
// ==============================================================================
// No existe hoy ningún endpoint de Adonis para listar TODAS las tiendas con estatus/representante/
// contacto administrativo (GET /store solo devuelve id+nombre y requiere Bearer, ya usado en
// comercios/productos/page.jsx para el selector Master — no expone estos campos). Este directorio se
// construye completo y funcional contra un set de datos de ejemplo (MOCK_TIENDAS abajo), con esta misma
// función como punto de conexión futura. Mismo patrón que /reportes y /comercios/cierre-caja.
//
// La guarda de acceso usa useAuth()/isAdmin (AuthContext, login real en /login) — NO
// localStorage.getItem("iac"), que no existe en ningún punto de este proyecto (el localStorage real del
// ERP interno es "duna_user", ver AuthContext.jsx; "iac_store" es un token distinto, del Portal de
// Comercios, sin relación con el acceso de administrador aquí).
//
// Mismo vocabulario de nichos que comercios/productos/page.jsx (NICHOS), para que el filtro describa
// exactamente los mismos rubros que ya existen en el resto del ERP.
const NICHOS_FILTRO = [
  "General",
  "Farmacia, Salud & Cuidado Personal",
  "Tecnología, Hogar & Ferretería",
  "Gastronomía & Heladería",
  "Granel / Peso",
  "Supermercado, Bodegones & Licores",
  "Moda, Calzado & Perfumería",
];

const MOCK_TIENDAS = [
  { id: 47, nombre: "Farma D'una Virtual", nicho: "Farmacia, Salud & Cuidado Personal", representante: "Carlos Pérez", contacto: "0414-1234567", estatus: "ACTIVO" },
  { id: 39, nombre: "Papaíto Helado", nicho: "Gastronomía & Heladería", representante: "Ana Gómez", contacto: "0412-9876543", estatus: "ACTIVO" },
  { id: 12, nombre: "Bodegón El Ahorro", nicho: "Supermercado, Bodegones & Licores", representante: "Luis Rodríguez", contacto: "0424-5551234", estatus: "SUSPENDIDO" },
  { id: 8, nombre: "TecnoHogar Cabimas", nicho: "Tecnología, Hogar & Ferretería", representante: "María Fernández", contacto: "0426-7778899", estatus: "ACTIVO" },
  { id: 21, nombre: "Boutique Elegance", nicho: "Moda, Calzado & Perfumería", representante: "Sofía Ramírez", contacto: "0414-3332211", estatus: "ACTIVO" },
  { id: 5, nombre: "Pizzería El Peluche", nicho: "Gastronomía & Heladería", representante: "Jorge Martínez", contacto: "0412-4445566", estatus: "SUSPENDIDO" },
];

function cargarTiendasDemo() {
  return MOCK_TIENDAS;
}

// Menú de acciones por fila: desplegable anclado al botón (mismo patrón sin overlay/modal que
// SelectorTienda en comercios/productos/page.jsx), nunca un modal ni un overlay a pantalla completa.
function MenuAcciones({ onImpersonar, onCambiarEstatus, onEditar, estatus }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const alPresionar = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", alPresionar);
    return () => document.removeEventListener("mousedown", alPresionar);
  }, [abierto]);

  return (
    <div ref={contenedorRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Acciones"
        className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 transition"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {abierto && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden text-left">
          <button
            type="button"
            onClick={() => { setAbierto(false); onImpersonar(); }}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-orange-50 hover:text-[#FE6712] transition text-left"
          >
            <LogIn className="w-3.5 h-3.5 shrink-0" /> Entrar como comercio
          </button>
          <button
            type="button"
            onClick={() => { setAbierto(false); onCambiarEstatus(); }}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition text-left"
          >
            <Power className="w-3.5 h-3.5 shrink-0" /> {estatus === "ACTIVO" ? "Suspender" : "Activar"}
          </button>
          <button
            type="button"
            onClick={() => { setAbierto(false); onEditar(); }}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition text-left border-t border-slate-100"
          >
            <Pencil className="w-3.5 h-3.5 shrink-0" /> Editar Información Básica
          </button>
        </div>
      )}
    </div>
  );
}

export default function MasterTiendasPage() {
  const router = useRouter();
  const { isAdmin, loading: cargandoAuth, logout, user } = useAuth();

  const [tiendas, setTiendas] = useState(() => cargarTiendasDemo());
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("TODOS");
  const [filtroNicho, setFiltroNicho] = useState("TODOS");
  const [editandoId, setEditandoId] = useState(null);
  const [formEdicion, setFormEdicion] = useState({ nombre: "", nicho: "General", representante: "", contacto: "" });

  const handleCerrarSesionErp = () => {
    logout();
    router.replace("/login");
  };

  const handleImpersonar = (tienda) => {
    // Siembra la MISMA sesión real que usa el Portal de Comercios (iac_store/ud_store, ver
    // commerceServices.js) para entrar con la identidad de la tienda — funcional para navegar el
    // portal, pero el token es de mentira: cualquier llamada real a Adonis desde ahí devolverá 401
    // hasta que exista un endpoint real de impersonación administrativa.
    localStorage.setItem("iac_store", `impersonado-admin-${tienda.id}`);
    localStorage.setItem("ud_store", JSON.stringify({ id: tienda.id, entityId: tienda.id, name: tienda.nombre, nombre: tienda.nombre }));
    router.push("/comercios/configuracion");
  };

  const handleCambiarEstatus = (id) => {
    setTiendas((prev) => prev.map((t) => (t.id === id ? { ...t, estatus: t.estatus === "ACTIVO" ? "SUSPENDIDO" : "ACTIVO" } : t)));
  };

  const handleAbrirEdicion = (tienda) => {
    setEditandoId(tienda.id);
    setFormEdicion({ nombre: tienda.nombre, nicho: tienda.nicho, representante: tienda.representante, contacto: tienda.contacto });
  };

  const handleGuardarEdicion = (id) => {
    setTiendas((prev) => prev.map((t) => (t.id === id ? { ...t, ...formEdicion } : t)));
    setEditandoId(null);
  };

  if (cargandoAuth) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-sm p-8 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-base font-black text-slate-900">Acceso restringido</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            El Master de Tiendas solo está disponible para roles de Administración.
          </p>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FE6712] hover:underline pt-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const tiendasFiltradas = tiendas.filter((t) => {
    const q = busqueda.trim().toLowerCase();
    const coincideTexto = !q || t.nombre.toLowerCase().includes(q) || t.representante.toLowerCase().includes(q) || String(t.id).includes(q);
    const coincideEstatus = filtroEstatus === "TODOS" || t.estatus === filtroEstatus;
    const coincideNicho = filtroNicho === "TODOS" || t.nicho === filtroNicho;
    return coincideTexto && coincideEstatus && coincideNicho;
  });

  return (
    <div className="flex min-h-screen bg-white">
      <SidebarTienda onCerrarSesion={handleCerrarSesionErp} />

      <div className="flex-1 min-h-screen bg-white text-slate-800 flex flex-col font-sans">
        <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900">Master de Tiendas</span>
                <span className="text-[11px] bg-orange-50 text-[#FE6712] px-2.5 py-0.5 rounded-full font-bold border border-orange-200">DEMO</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Directorio global de comercios</p>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800 text-left">
            Datos de Ejemplo — no existe hoy un endpoint de Adonis que liste todas las tiendas con estatus,
            representante y contacto. Sustituir cargarTiendasDemo (arriba en este archivo) por la llamada
            real cuando el backend la entregue.
          </div>

          <div className="flex flex-wrap items-center gap-3 text-left">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, representante o ID..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
            </div>
            <select
              value={filtroEstatus}
              onChange={(e) => setFiltroEstatus(e.target.value)}
              className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:outline-none focus:border-[#FE6712]"
            >
              <option value="TODOS">Todos los estatus</option>
              <option value="ACTIVO">Activo</option>
              <option value="SUSPENDIDO">Suspendido</option>
            </select>
            <select
              value={filtroNicho}
              onChange={(e) => setFiltroNicho(e.target.value)}
              className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:outline-none focus:border-[#FE6712]"
            >
              <option value="TODOS">Todos los nichos</option>
              {NICHOS_FILTRO.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Nombre del Comercio</th>
                  <th className="p-3">Nicho</th>
                  <th className="p-3">Representante</th>
                  <th className="p-3">Contacto</th>
                  <th className="p-3">Estatus</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tiendasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-10 text-center text-xs text-slate-400">No se encontraron comercios que coincidan.</td>
                  </tr>
                ) : (
                  tiendasFiltradas.map((t) => {
                    const editando = editandoId === t.id;
                    return (
                      <React.Fragment key={t.id}>
                        <tr className="hover:bg-slate-50 transition">
                          <td className="p-3 font-mono text-slate-500">#{t.id}</td>
                          <td className="p-3 font-bold text-slate-800">{t.nombre}</td>
                          <td className="p-3 text-slate-600">{t.nicho}</td>
                          <td className="p-3 text-slate-600">{t.representante}</td>
                          <td className="p-3 text-slate-600 font-mono">{t.contacto}</td>
                          <td className="p-3">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border whitespace-nowrap ${
                              t.estatus === "ACTIVO"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}>
                              {t.estatus === "ACTIVO" ? "Activo" : "Suspendido"}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <MenuAcciones
                              estatus={t.estatus}
                              onImpersonar={() => handleImpersonar(t)}
                              onCambiarEstatus={() => handleCambiarEstatus(t.id)}
                              onEditar={() => handleAbrirEdicion(t)}
                            />
                          </td>
                        </tr>
                        {editando && (
                          <tr className="bg-slate-50">
                            <td colSpan="7" className="p-4">
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-left">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Nombre</label>
                                  <input
                                    type="text"
                                    value={formEdicion.nombre}
                                    onChange={(e) => setFormEdicion((p) => ({ ...p, nombre: e.target.value }))}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Nicho</label>
                                  <select
                                    value={formEdicion.nicho}
                                    onChange={(e) => setFormEdicion((p) => ({ ...p, nicho: e.target.value }))}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                                  >
                                    {NICHOS_FILTRO.map((n) => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Representante</label>
                                  <input
                                    type="text"
                                    value={formEdicion.representante}
                                    onChange={(e) => setFormEdicion((p) => ({ ...p, representante: e.target.value }))}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Contacto</label>
                                  <input
                                    type="text"
                                    value={formEdicion.contacto}
                                    onChange={(e) => setFormEdicion((p) => ({ ...p, contacto: e.target.value }))}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-2 mt-3">
                                <button
                                  type="button"
                                  onClick={() => setEditandoId(null)}
                                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[11px] font-bold hover:bg-slate-100 transition flex items-center gap-1"
                                >
                                  <X className="w-3.5 h-3.5" /> Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleGuardarEdicion(t.id)}
                                  className="px-3 py-1.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" /> Guardar
                                </button>
                              </div>
                              {t.nicho === "Gastronomía & Heladería" && <ConfiguracionGastronomica token={user?.token} storeId={t.id} />}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">Mostrando {tiendasFiltradas.length} de {tiendas.length} comercios.</p>
        </main>
      </div>
    </div>
  );
}

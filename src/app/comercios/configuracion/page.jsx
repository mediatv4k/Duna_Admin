"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Check, Hash, Store, MapPin, User, Phone } from "lucide-react";
import { obtenerTokenComercio, obtenerUsuarioComercio } from "@/lib/commerceServices";
import SidebarTienda from "@/components/comercios/SidebarTienda";

// Vista de Configuración (rediseño premium, 100% nueva — no existía ninguna versión anterior de este
// formulario en el repositorio). No hay ningún endpoint de Adonis conocido para actualizar Dirección,
// Responsable o Teléfono de una tienda: esos tres campos se guardan solo en este navegador
// (localStorage, clave `comercio_config_<storeId>`), con un aviso visible al respecto. Código y Nombre
// sí vienen de la sesión real (ud_store) y se muestran de solo lectura, porque tampoco hay un endpoint
// confirmado para renombrar o recodificar una tienda desde aquí.
function claveConfigLocal(storeId) {
  return `comercio_config_${storeId}`;
}

function Campo({ etiqueta, icono: Icono, children }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-slate-600 block mb-1.5">{etiqueta}</label>
      <div className="relative">
        <Icono className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        {children}
      </div>
    </div>
  );
}

const claseInput = "w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition disabled:bg-slate-50 disabled:text-slate-500";

export default function ConfiguracionComercioPage() {
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

  const [datosLocales, setDatosLocales] = useState({ direccion: "", responsable: "", telefono: "" });
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    try {
      const guardadoPrevio = JSON.parse(localStorage.getItem(claveConfigLocal(storeId)) || "null");
      if (guardadoPrevio) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente y una vez se conoce storeId
        setDatosLocales((prev) => ({ ...prev, ...guardadoPrevio }));
      }
    } catch (e) {
      // localStorage corrupto o inaccesible: se ignora y queda el formulario en blanco
    }
  }, [storeId]);

  const handleGuardar = (e) => {
    e.preventDefault();
    localStorage.setItem(claveConfigLocal(storeId), JSON.stringify(datosLocales));
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  };

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
        <header className="h-16 border-b border-slate-100 bg-white/95 backdrop-blur sticky top-0 z-30 flex items-center px-6 sm:px-8">
          <div>
            <span className="text-sm font-black text-slate-900">Configuración</span>
            <p className="text-[11px] text-slate-400 font-medium">Datos básicos de la tienda</p>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-6">
          <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-6">
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wide mb-4">Identificación de la tienda</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo etiqueta="Código" icono={Hash}>
                <input type="text" value={storeId ?? ""} disabled className={claseInput} />
              </Campo>
              <Campo etiqueta="Nombre" icono={Store}>
                <input type="text" value={comercio?.name || comercio?.nombre || ""} disabled className={claseInput} />
              </Campo>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">
              Código y Nombre vienen de tu sesión en Adonis; no hay todavía un endpoint para editarlos desde aquí.
            </p>
          </div>

          <form onSubmit={handleGuardar} className="rounded-xl bg-white shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-wide">Datos de contacto</h2>
            <Campo etiqueta="Dirección" icono={MapPin}>
              <input
                type="text"
                value={datosLocales.direccion}
                onChange={(e) => setDatosLocales((prev) => ({ ...prev, direccion: e.target.value }))}
                placeholder="Av. Principal, local 3, Cabimas"
                className={claseInput}
              />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo etiqueta="Responsable" icono={User}>
                <input
                  type="text"
                  value={datosLocales.responsable}
                  onChange={(e) => setDatosLocales((prev) => ({ ...prev, responsable: e.target.value }))}
                  placeholder="Nombre del encargado"
                  className={claseInput}
                />
              </Campo>
              <Campo etiqueta="Teléfono" icono={Phone}>
                <input
                  type="tel"
                  value={datosLocales.telefono}
                  onChange={(e) => setDatosLocales((prev) => ({ ...prev, telefono: e.target.value }))}
                  placeholder="0412-0000000"
                  className={claseInput}
                />
              </Campo>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-800">
              Dirección, Responsable y Teléfono se guardan solo en este navegador — no existe hoy un endpoint
              de Adonis para persistir estos datos en el servidor.
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              {guardado && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                  <Check className="w-4 h-4" /> Guardado
                </span>
              )}
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                <Save className="w-4 h-4" /> Guardar
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

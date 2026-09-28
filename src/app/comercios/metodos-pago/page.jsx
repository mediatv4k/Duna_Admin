"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Check, CreditCard, AlertTriangle } from "lucide-react";
import { obtenerTokenComercio, obtenerUsuarioComercio, actualizarTiendaComercio } from "@/lib/commerceServices";
import SidebarTienda from "@/components/comercios/SidebarTienda";

// Vista independizada de Configuración/Horario. Comparte la MISMA clave de localStorage que esas dos
// (`comercio_config_<storeId>`, ver claveConfigLocal en comercios/configuracion/page.jsx) porque las tres
// describen la misma tienda — pero esta página solo lee/escribe "metodosPago", siempre fusionando sobre
// lo que ya había guardado en las otras, para nunca pisar Dirección/Responsable/Teléfono/Ubicación/Nicho
// ni Horario al guardar desde aquí (ni al revés). Mismo patrón de "preservar el objeto completo" ya usado
// en toda la ficha de metadata de comercios/productos/page.jsx.
function claveConfigLocal(storeId) {
  return `comercio_config_${storeId}`;
}

// Mismo vocabulario de métodos de pago que /pos (METODOS_PAGO), para no inventar una lista paralela.
const METODOS_PAGO_DISPONIBLES = [
  "Efectivo USD", "Efectivo Bs", "Pago Móvil", "Zelle",
  "Transf. Mismo Banco", "Transf. Interbancaria", "Punto de Venta",
];

export default function MetodosPagoComercioPage() {
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

  const [metodosPago, setMetodosPago] = useState([]);
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorBackend, setErrorBackend] = useState("");

  useEffect(() => {
    if (!storeId) return;
    try {
      const guardadoPrevio = JSON.parse(localStorage.getItem(claveConfigLocal(storeId)) || "null");
      if (Array.isArray(guardadoPrevio?.metodosPago)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente y una vez se conoce storeId
        setMetodosPago(guardadoPrevio.metodosPago);
      }
    } catch (e) {
      // localStorage corrupto o inaccesible: se ignora y queda la lista vacía
    }
  }, [storeId]);

  const handleToggleMetodoPago = (metodo) => {
    setMetodosPago((prev) => (prev.includes(metodo) ? prev.filter((m) => m !== metodo) : [...prev, metodo]));
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorBackend("");

    // Fusiona sobre lo que ya hubiera en localStorage (Dirección/Responsable/Teléfono/Ubicación/Nicho de
    // Configuración, horario de Horario): nunca se sobreescribe el objeto completo.
    let previo = {};
    try {
      previo = JSON.parse(localStorage.getItem(claveConfigLocal(storeId)) || "{}") || {};
    } catch (e) {
      previo = {};
    }
    localStorage.setItem(claveConfigLocal(storeId), JSON.stringify({ ...previo, metodosPago }));

    // Intento optimista contra Adonis (PUT /store/:storeId), mismo patrón que Configuración: sin
    // contrato confirmado, no se depende de esto — el localStorage de arriba ya es la fuente de verdad.
    try {
      await actualizarTiendaComercio(storeId, { metodosPago }, token);
    } catch (err) {
      console.warn("No se pudo sincronizar métodos de pago con Adonis, queda el respaldo local.", err);
      setErrorBackend("Se guardó en este navegador, pero el servidor no confirmó el cambio.");
    }

    setGuardando(false);
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
            <span className="text-sm font-black text-slate-900">Métodos de Pago</span>
            <p className="text-[11px] text-slate-400 font-medium">Formas de cobro aceptadas por la tienda</p>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-6">
          <form onSubmit={handleGuardar} className="w-full text-left rounded-xl bg-white shadow-sm border border-gray-100 p-6 space-y-6">

            <div className="w-full text-left space-y-3">
              <h2 className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-[#FE6712]" /> Métodos de Pago Aceptados
              </h2>
              <div className="flex flex-wrap justify-start gap-2 text-left">
                {METODOS_PAGO_DISPONIBLES.map((metodo) => {
                  const activo = metodosPago.includes(metodo);
                  return (
                    <button
                      key={metodo}
                      type="button"
                      onClick={() => handleToggleMetodoPago(metodo)}
                      aria-pressed={activo}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                        activo
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-white text-slate-500 border-slate-200 hover:border-[#FE6712] hover:text-[#FE6712]"
                      }`}
                    >
                      {activo && <Check className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                      {metodo}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-800">
              Los métodos de pago se guardan de forma confiable solo en este navegador — no hay hoy un
              endpoint de Adonis confirmado para persistirlos en el servidor (se intenta igual, de forma
              optimista, al guardar).
            </div>

            {errorBackend && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorBackend}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              {guardado && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                  <Check className="w-4 h-4" /> Guardado
                </span>
              )}
              <button
                type="submit"
                disabled={guardando}
                className="px-5 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] disabled:opacity-70 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

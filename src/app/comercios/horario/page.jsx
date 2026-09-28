"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Check, Clock, AlertTriangle } from "lucide-react";
import { obtenerTokenComercio, obtenerUsuarioComercio, actualizarTiendaComercio } from "@/lib/commerceServices";
import SidebarTienda from "@/components/comercios/SidebarTienda";

// Vista independizada desde Configuración (antes vivía amontonada ahí junto con datos de contacto y
// ubicación). Comparte la MISMA clave de localStorage que Configuración y Métodos de Pago
// (`comercio_config_<storeId>`, ver claveConfigLocal en comercios/configuracion/page.jsx) porque las tres
// describen la misma tienda — pero cada página solo lee/escribe los campos que le pertenecen (aquí solo
// "horario"), siempre fusionando sobre lo que ya había guardado en las otras, para nunca pisar
// Dirección/Responsable/Teléfono/Ubicación/Nicho ni Métodos de Pago al guardar desde aquí (ni al revés).
// Mismo patrón de "preservar el objeto completo" ya usado en toda la ficha de metadata de
// comercios/productos/page.jsx.
function claveConfigLocal(storeId) {
  return `comercio_config_${storeId}`;
}

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function horarioInicial() {
  return DIAS_SEMANA.reduce((acc, dia) => {
    acc[dia] = { abierto: true, desde: "08:00", hasta: "18:00" };
    return acc;
  }, {});
}

// Estimación local (no viene del backend): compara la hora actual del navegador contra el horario
// configurado para hoy. Solo informativa, se etiqueta como tal en la interfaz.
function estaAbiertoAhora(horario) {
  const ahora = new Date();
  const diaHoy = DIAS_SEMANA[(ahora.getDay() + 6) % 7]; // getDay(): 0=Domingo -> reindexa a Lunes=0
  const config = horario?.[diaHoy];
  if (!config || !config.abierto) return false;
  const horaActual = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  return horaActual >= config.desde && horaActual <= config.hasta;
}

export default function HorarioComercioPage() {
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

  const [horario, setHorario] = useState(horarioInicial());
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorBackend, setErrorBackend] = useState("");

  useEffect(() => {
    if (!storeId) return;
    try {
      const guardadoPrevio = JSON.parse(localStorage.getItem(claveConfigLocal(storeId)) || "null");
      if (guardadoPrevio?.horario) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente y una vez se conoce storeId
        setHorario((prev) => ({ ...prev, ...guardadoPrevio.horario }));
      }
    } catch (e) {
      // localStorage corrupto o inaccesible: se ignora y quedan los valores por defecto
    }
  }, [storeId]);

  const handleCambiarHorarioDia = (dia, campo, valor) => {
    setHorario((prev) => ({ ...prev, [dia]: { ...prev[dia], [campo]: valor } }));
  };

  const abiertoAhora = estaAbiertoAhora(horario);

  const handleGuardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorBackend("");

    // Fusiona sobre lo que ya hubiera en localStorage (Dirección/Responsable/Teléfono/Ubicación/Nicho de
    // Configuración, metodosPago de Métodos de Pago): nunca se sobreescribe el objeto completo.
    let previo = {};
    try {
      previo = JSON.parse(localStorage.getItem(claveConfigLocal(storeId)) || "{}") || {};
    } catch (e) {
      previo = {};
    }
    localStorage.setItem(claveConfigLocal(storeId), JSON.stringify({ ...previo, horario }));

    // Intento optimista contra Adonis (PUT /store/:storeId), mismo patrón que Configuración: sin
    // contrato confirmado, no se depende de esto — el localStorage de arriba ya es la fuente de verdad.
    try {
      await actualizarTiendaComercio(storeId, { horario }, token);
    } catch (err) {
      console.warn("No se pudo sincronizar el horario con Adonis, queda el respaldo local.", err);
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
            <span className="text-sm font-black text-slate-900">Horario de Atención</span>
            <p className="text-[11px] text-slate-400 font-medium">Días y franjas horarias de la tienda</p>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-6">
          <form onSubmit={handleGuardar} className="w-full text-left rounded-xl bg-white shadow-sm border border-gray-100 p-6 space-y-6">

            <div className="w-full text-left space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#FE6712]" /> Horario de Atención
                </h2>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                  abiertoAhora ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
                }`}>
                  {abiertoAhora ? "Abierto ahora (estimado)" : "Cerrado ahora (estimado)"}
                </span>
              </div>
              <div className="w-full space-y-1.5">
                {DIAS_SEMANA.map((dia) => {
                  const config = horario[dia];
                  return (
                    <div key={dia} className="w-full flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={config.abierto}
                        aria-label={`${config.abierto ? "Cerrar" : "Abrir"} ${dia}`}
                        onClick={() => handleCambiarHorarioDia(dia, "abierto", !config.abierto)}
                        className={`w-8 h-5 shrink-0 rounded-full relative transition-colors ${config.abierto ? "bg-[#FE6712]" : "bg-slate-200"}`}
                      >
                        <span className={`w-4 h-4 bg-white rounded-full shadow-sm absolute top-[2px] transition-all ${config.abierto ? "left-[14px]" : "left-[2px]"}`} />
                      </button>
                      <span className="text-xs font-bold text-slate-700 w-20 shrink-0">{dia}</span>
                      {config.abierto ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="time"
                            value={config.desde}
                            onChange={(e) => handleCambiarHorarioDia(dia, "desde", e.target.value)}
                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-[#FE6712]"
                          />
                          <span className="text-slate-400 text-xs">—</span>
                          <input
                            type="time"
                            value={config.hasta}
                            onChange={(e) => handleCambiarHorarioDia(dia, "hasta", e.target.value)}
                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-[#FE6712]"
                          />
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic flex-1">Cerrado</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-800">
              El horario se guarda de forma confiable solo en este navegador — no hay hoy un endpoint de
              Adonis confirmado para persistirlo en el servidor (se intenta igual, de forma optimista, al
              guardar).
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

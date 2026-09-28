"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Save, Check, Hash, Store, MapPin, User, Phone, Briefcase,
  LocateFixed, ExternalLink, CreditCard, Clock, AlertTriangle,
} from "lucide-react";
import { obtenerTokenComercio, obtenerUsuarioComercio, actualizarTiendaComercio } from "@/lib/commerceServices";
import SidebarTienda from "@/components/comercios/SidebarTienda";

// Vista de Configuración (rediseño premium — no existía ninguna versión anterior de este formulario en
// el repositorio). No hay ningún endpoint de Adonis confirmado para Dirección, Responsable, Teléfono,
// coordenadas, métodos de pago ni horario de una tienda: todo eso se guarda de forma confiable solo en
// este navegador (localStorage, clave `comercio_config_<storeId>`), con un aviso visible al respecto, y
// se intenta además un PUT optimista a /store/:storeId (actualizarTiendaComercio) por si el backend llega
// a persistirlo — mismo patrón ya probado para la ficha de farmacia y los atributos de supermercado en
// comercios/productos/page.jsx. Código y Nombre sí vienen de la sesión real (ud_store) y se muestran de
// solo lectura, porque tampoco hay un endpoint confirmado para renombrar o recodificar una tienda.
function claveConfigLocal(storeId) {
  return `comercio_config_${storeId}`;
}

// Mismo vocabulario de nichos que comercios/productos/page.jsx (NICHOS): evita que la tienda quede
// configurada con un rubro que no coincide con ninguna opción real del selector de productos.
const NICHOS_COMERCIO = [
  "General",
  "Farmacia & Salud",
  "Tecnología & Hogar",
  "Gastronomía & Heladería",
  "Granel / Peso",
  "Supermercado / Hipermercado & Licores",
];

// Mismo vocabulario de métodos de pago que /pos (METODOS_PAGO), para no inventar una lista paralela.
const METODOS_PAGO_DISPONIBLES = [
  "Efectivo USD", "Efectivo Bs", "Pago Móvil", "Zelle",
  "Transf. Mismo Banco", "Transf. Interbancaria", "Punto de Venta",
];

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

  const [datosLocales, setDatosLocales] = useState({
    direccion: "", responsable: "", telefono: "",
    lat: "", lng: "",
    metodosPago: [],
    horario: horarioInicial(),
  });
  const [nicho, setNicho] = useState("General");
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorBackend, setErrorBackend] = useState("");
  const [ubicando, setUbicando] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState("");

  useEffect(() => {
    if (!storeId) return;
    try {
      const guardadoPrevio = JSON.parse(localStorage.getItem(claveConfigLocal(storeId)) || "null");
      if (guardadoPrevio) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente y una vez se conoce storeId
        setDatosLocales((prev) => ({ ...prev, ...guardadoPrevio }));
      }
      
      const nichoPrevio = localStorage.getItem(`store_nicho_${storeId}`);
      if (nichoPrevio) {
        setNicho(nichoPrevio);
      }
    } catch (e) {
      // localStorage corrupto o inaccesible: se ignora y queda el formulario en blanco
    }
  }, [storeId]);

  const handleToggleMetodoPago = (metodo) => {
    setDatosLocales((prev) => ({
      ...prev,
      metodosPago: prev.metodosPago.includes(metodo)
        ? prev.metodosPago.filter((m) => m !== metodo)
        : [...prev.metodosPago, metodo],
    }));
  };

  const handleCambiarHorarioDia = (dia, campo, valor) => {
    setDatosLocales((prev) => ({
      ...prev,
      horario: { ...prev.horario, [dia]: { ...prev.horario[dia], [campo]: valor } },
    }));
  };

  // Geolocalización real vía API nativa del navegador (sin dependencias ni API key): no hay ningún SDK
  // de mapas instalado en el proyecto (ver package.json), así que en vez de fabricar un mapa embebido
  // que no funcionaría, se ofrece lo que sí es 100% funcional: fijar coordenadas con el GPS del
  // dispositivo y abrir esas coordenadas en Google Maps en una pestaña nueva.
  const handleUsarUbicacionActual = () => {
    if (!navigator.geolocation) {
      setErrorUbicacion("Este navegador no soporta geolocalización.");
      return;
    }
    setErrorUbicacion("");
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDatosLocales((prev) => ({
          ...prev,
          lat: String(pos.coords.latitude),
          lng: String(pos.coords.longitude),
        }));
        setUbicando(false);
      },
      (err) => {
        setErrorUbicacion(err.code === 1
          ? "Permiso de ubicación denegado. Actívalo en tu navegador o ingresa las coordenadas manualmente."
          : "No se pudo obtener tu ubicación. Ingresa las coordenadas manualmente.");
        setUbicando(false);
      }
    );
  };

  const tieneCoordenadas = datosLocales.lat !== "" && datosLocales.lng !== "";
  const urlGoogleMaps = tieneCoordenadas
    ? `https://www.google.com/maps?q=${encodeURIComponent(datosLocales.lat)},${encodeURIComponent(datosLocales.lng)}`
    : null;
  const abiertoAhora = estaAbiertoAhora(datosLocales.horario);

  const handleGuardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorBackend("");

    // Guardar en localStorage: única persistencia confirmada para estos campos (ver aviso en pantalla)
    localStorage.setItem(claveConfigLocal(storeId), JSON.stringify(datosLocales));
    localStorage.setItem(`store_nicho_${storeId}`, nicho);

    // Intento optimista contra Adonis (PUT /store/:storeId): ningún campo de esta sección tiene un
    // contrato confirmado contra el backend real, así que se envían todos por si el servidor los acepta,
    // sin depender de ello — el localStorage de arriba ya es la fuente de verdad para esta pantalla.
    try {
      await actualizarTiendaComercio(storeId, {
        nicho,
        address: datosLocales.direccion,
        responsable: datosLocales.responsable,
        phone: datosLocales.telefono,
        lat: datosLocales.lat ? Number(datosLocales.lat) : null,
        lng: datosLocales.lng ? Number(datosLocales.lng) : null,
        metodosPago: datosLocales.metodosPago,
        horario: datosLocales.horario,
      }, token);
    } catch (err) {
      // No es un fallo silencioso: se guardó localmente (fuente de verdad), pero se avisa que el
      // servidor no confirmó el cambio, sin bloquear ni usar un modal.
      console.warn("No se pudo sincronizar la configuración con Adonis, queda el respaldo local.", err);
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

          <form onSubmit={handleGuardar} className="rounded-xl bg-white shadow-sm border border-gray-100 p-6 space-y-6">
            
            <div className="space-y-2.5">
              <h2 className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-[#FE6712]" /> Nicho / Rubro del Comercio
              </h2>
              <div className="flex flex-wrap gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                {NICHOS_COMERCIO.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNicho(n)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                      nicho === n
                        ? "bg-[#FE6712] text-white shadow-sm"
                        : "bg-white text-slate-600 border border-slate-200 hover:border-[#FE6712] hover:text-[#FE6712]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">
                Define el rubro principal de la tienda. Cada producto conserva su propio nicho (una tienda puede vender de varios rubros a la vez).
              </p>
            </div>

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

            {/* Geolocalización: sin SDK de mapas instalado en el proyecto, así que en vez de un mapa
                embebido que no funcionaría sin API key, se ofrece lo que sí es 100% real: GPS del
                dispositivo + coordenadas manuales + enlace directo a Google Maps. */}
            <div className="pt-2 border-t border-dashed border-slate-200 space-y-3">
              <h2 className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#FE6712]" /> Ubicación Geográfica
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo etiqueta="Latitud" icono={MapPin}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={datosLocales.lat}
                    onChange={(e) => setDatosLocales((prev) => ({ ...prev, lat: e.target.value }))}
                    placeholder="Ej: 10.3910"
                    className={claseInput}
                  />
                </Campo>
                <Campo etiqueta="Longitud" icono={MapPin}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={datosLocales.lng}
                    onChange={(e) => setDatosLocales((prev) => ({ ...prev, lng: e.target.value }))}
                    placeholder="Ej: -71.5000"
                    className={claseInput}
                  />
                </Campo>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleUsarUbicacionActual}
                  disabled={ubicando}
                  className="px-3.5 py-2 bg-white hover:bg-orange-50 text-[#FE6712] border border-orange-200 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 disabled:opacity-60"
                >
                  {ubicando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
                  {ubicando ? "Ubicando..." : "Usar mi ubicación actual"}
                </button>
                {urlGoogleMaps && (
                  <a
                    href={urlGoogleMaps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver en Google Maps
                  </a>
                )}
              </div>
              {errorUbicacion && <p className="text-[11px] font-bold text-rose-600">{errorUbicacion}</p>}
            </div>

            {/* Métodos de pago: mismo vocabulario que /pos, para que lo configurado aquí describa
                exactamente lo que el cajero puede cobrar. */}
            <div className="pt-2 border-t border-dashed border-slate-200 space-y-3">
              <h2 className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-[#FE6712]" /> Métodos de Pago Aceptados
              </h2>
              <div className="flex flex-wrap gap-2">
                {METODOS_PAGO_DISPONIBLES.map((metodo) => {
                  const activo = datosLocales.metodosPago.includes(metodo);
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

            {/* Horario de atención: isOpen no viene del backend, se estima localmente comparando la
                hora del navegador contra este horario — se etiqueta como estimación, no como dato oficial. */}
            <div className="pt-2 border-t border-dashed border-slate-200 space-y-3">
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
              <div className="space-y-1.5">
                {DIAS_SEMANA.map((dia) => {
                  const config = datosLocales.horario[dia];
                  return (
                    <div key={dia} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
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
              Dirección, Responsable, Teléfono, Ubicación, Métodos de Pago y Horario se guardan de forma
              confiable solo en este navegador — no hay hoy un endpoint de Adonis confirmado para
              persistir estos datos en el servidor (se intenta igual, de forma optimista, al guardar).
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

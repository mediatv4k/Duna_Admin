"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, X, ShieldCheck, Lock, LogOut, Loader2, AlertCircle, Clock } from "lucide-react";

const CONFIG_SUPERVISORES_DEFECTO = {
  pinMaestro: "9999",
  supervisores: [
    { id: "sup_01", nombre: "Supervisor de Turno", pin: "9999" },
  ],
};

function formatearBs(montoUsd) {
  return (Number(montoUsd) || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SupervisorPortal() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [cargando, setCargando] = useState(true);
  const [configSupervisores, setConfigSupervisores] = useState(CONFIG_SUPERVISORES_DEFECTO);
  const [sesion, setSesion] = useState(null);
  const [nombreLogin, setNombreLogin] = useState("");
  const [pinLogin, setPinLogin] = useState("");
  const [errorLogin, setErrorLogin] = useState("");
  const [solicitud, setSolicitud] = useState(null);
  const [resultadoAccion, setResultadoAccion] = useState(null);
  const [ahora, setAhora] = useState(0);

  useEffect(() => {
    let config = CONFIG_SUPERVISORES_DEFECTO;
    const configGuardada = localStorage.getItem("duna_config_supervisores");
    if (configGuardada) {
      try {
        config = JSON.parse(configGuardada);
      } catch (e) {
        console.error(e);
      }
    } else {
      localStorage.setItem("duna_config_supervisores", JSON.stringify(CONFIG_SUPERVISORES_DEFECTO));
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
    setConfigSupervisores(config);

    const sesionGuardada = localStorage.getItem("duna_supervisor_sesion");
    if (sesionGuardada) {
      try {
        setSesion(JSON.parse(sesionGuardada));
      } catch (e) {
        console.error(e);
      }
    }

    if (token) {
      try {
        const registros = JSON.parse(localStorage.getItem("duna_autorizaciones_credito") || "[]");
        const match = registros.find((r) => r.tokenAuth === token);
        setSolicitud(match || null);
      } catch (e) {
        console.error(e);
      }
    }

    setAhora(Date.now());
    setCargando(false);
  }, [token]);

  const handleLogin = (e) => {
    e.preventDefault();
    const pin = pinLogin.trim();
    const supervisorMatch = (configSupervisores.supervisores || []).find((s) => s.pin === pin);
    const pinValido = pin.length === 4 && (pin === (configSupervisores.pinMaestro || "9999") || !!supervisorMatch);
    if (!pinValido) {
      setErrorLogin("PIN incorrecto. Verifica con tu administrador.");
      return;
    }
    const nuevaSesion = {
      id: supervisorMatch?.id || "sup_maestro",
      nombre: nombreLogin.trim() || supervisorMatch?.nombre || "Supervisor",
    };
    localStorage.setItem("duna_supervisor_sesion", JSON.stringify(nuevaSesion));
    setSesion(nuevaSesion);
    setErrorLogin("");
  };

  const handleCerrarSesion = () => {
    localStorage.removeItem("duna_supervisor_sesion");
    setSesion(null);
    setNombreLogin("");
    setPinLogin("");
  };

  const resolverSolicitud = (nuevoStatus) => {
    if (!solicitud || !sesion) return;
    const supervisorInfo = {
      supervisorNombre: sesion.nombre,
      supervisorId: sesion.id,
      horaAutorizacion: new Date().toLocaleString("es-VE"),
    };
    const registros = JSON.parse(localStorage.getItem("duna_autorizaciones_credito") || "[]");
    const actualizados = registros.map((r) =>
      r.tokenAuth === solicitud.tokenAuth ? { ...r, status: nuevoStatus, supervisorInfo } : r
    );
    localStorage.setItem("duna_autorizaciones_credito", JSON.stringify(actualizados));
    setSolicitud((prev) => (prev ? { ...prev, status: nuevoStatus, supervisorInfo } : prev));
    setResultadoAccion(nuevoStatus);
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
      </div>
    );
  }

  const yaExpirado = solicitud && ahora > solicitud.expiraEn;

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 font-sans">
      <div className="w-full max-w-sm space-y-4 py-6">

        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-[#0a0e17] text-white flex items-center justify-center mx-auto font-black text-lg shadow-md">
            <ShieldCheck className="w-6 h-6 text-[#FE6712]" />
          </div>
          <h1 className="text-sm font-black text-slate-900">Portal del Supervisor</h1>
          <p className="text-[11px] text-slate-400 font-medium">Autorización de ventas a crédito en caja</p>
        </div>

        {sesion && (
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-2.5">
            <span className="text-xs font-bold text-slate-700">👤 {sesion.nombre}</span>
            <button type="button" onClick={handleCerrarSesion} className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-600 transition">
              <LogOut className="w-3.5 h-3.5" /> Salir
            </button>
          </div>
        )}

        {!token ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
            <h2 className="text-sm font-black text-slate-900">Sin solicitud activa</h2>
            <p className="text-xs text-slate-500 leading-relaxed">Escanea el código QR que te muestra la caja para autorizar una venta a crédito.</p>
          </div>
        ) : !solicitud ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <h2 className="text-sm font-black text-slate-900">Enlace no válido</h2>
            <p className="text-xs text-slate-500 leading-relaxed">Esta solicitud de autorización no existe. Pide a caja que genere un nuevo código QR.</p>
          </div>
        ) : !sesion ? (
          <form onSubmit={handleLogin} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="text-center space-y-1">
              <Lock className="w-6 h-6 text-slate-400 mx-auto" />
              <h2 className="text-sm font-black text-slate-900">Inicia sesión para continuar</h2>
              <p className="text-[11px] text-slate-400">Identifícate con tu nombre y PIN de supervisor</p>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Nombre del Supervisor</label>
              <input
                type="text"
                value={nombreLogin}
                onChange={(e) => setNombreLogin(e.target.value)}
                placeholder="Ej: María Pérez"
                autoComplete="off"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">PIN (4 dígitos)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                value={pinLogin}
                onChange={(e) => { setPinLogin(e.target.value.replace(/\D/g, "")); setErrorLogin(""); }}
                placeholder="••••"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-center tracking-[0.4em] text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
            </div>
            {errorLogin && <p className="text-[11px] text-rose-600 font-bold text-center">{errorLogin}</p>}
            <button
              type="submit"
              className="w-full py-3 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-sm font-black transition shadow-sm shadow-orange-500/20"
            >
              Ingresar
            </button>
          </form>
        ) : resultadoAccion === "APROBADA" ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7" />
            </div>
            <h2 className="text-base font-black text-slate-900">✓ Autorización enviada a Caja</h2>
            <p className="text-xs text-slate-500 leading-relaxed">La venta de {solicitud.clienteNombre} por ${solicitud.montoUsd.toFixed(2)} ya puede facturarse en el mostrador.</p>
          </div>
        ) : resultadoAccion === "RECHAZADA" ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <X className="w-7 h-7" />
            </div>
            <h2 className="text-base font-black text-slate-900">✕ Venta Rechazada</h2>
            <p className="text-xs text-slate-500 leading-relaxed">Se notificó a caja que esta venta a crédito no fue autorizada.</p>
          </div>
        ) : solicitud.status !== "PENDIENTE" ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
            <h2 className="text-sm font-black text-slate-900">Solicitud ya procesada</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Esta autorización ya fue {solicitud.status === "APROBADA" ? "aprobada" : solicitud.status === "RECHAZADA" ? "rechazada" : "marcada como expirada"} anteriormente.
            </p>
          </div>
        ) : yaExpirado ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 text-center space-y-2">
            <Clock className="w-8 h-8 text-amber-500 mx-auto" />
            <h2 className="text-sm font-black text-slate-900">Código Expirado</h2>
            <p className="text-xs text-slate-500 leading-relaxed">Pide a caja que genere un nuevo código QR para volver a intentarlo.</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Caja solicitante</p>
              <p className="text-sm font-bold text-slate-800">{solicitud.cajaId}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Cliente</p>
                <p className="text-sm font-bold text-slate-800 truncate">{solicitud.clienteNombre}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Documento</p>
                <p className="text-sm font-bold text-slate-800">{solicitud.clienteDocumento}</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
              <p className="text-[11px] text-amber-600 font-bold uppercase tracking-wide">Monto a Autorizar</p>
              <p className="text-2xl font-black text-amber-800">${solicitud.montoUsd.toFixed(2)}</p>
              <p className="text-xs text-amber-600 font-semibold">Bs. {formatearBs(solicitud.montoBs)}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => resolverSolicitud("RECHAZADA")}
                className="py-3 bg-white hover:bg-rose-50 text-rose-600 border-2 border-rose-200 rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5"
              >
                <X className="w-4 h-4" /> RECHAZAR
              </button>
              <button
                type="button"
                onClick={() => resolverSolicitud("APROBADA")}
                className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-500/20"
              >
                <Check className="w-4 h-4" /> APROBAR VENTA
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SupervisorFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
    </div>
  );
}

export default function SupervisorPage() {
  return (
    <Suspense fallback={<SupervisorFallback />}>
      <SupervisorPortal />
    </Suspense>
  );
}

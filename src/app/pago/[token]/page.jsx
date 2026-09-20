"use client";
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Copy, Check, Loader2, AlertCircle } from "lucide-react";
import bancosVenezuela from "@/data/bancosVenezuela";
import { escucharDocumento, actualizarDocumento } from "@/lib/firebase";

function formatearMontoBs(monto) {
  return (Number(monto) || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CeldaCopiable({ etiqueta, valor, campo, campoCopiado, onCopiar }) {
  return (
    <div className="flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-xl border border-slate-200 bg-white min-w-0">
      <div className="min-w-0">
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wide block">{etiqueta}</span>
        <span className="text-xs font-black font-mono text-slate-900 truncate block">{valor}</span>
      </div>
      <button
        type="button"
        onClick={() => onCopiar(valor, campo)}
        title={`Copiar ${etiqueta}`}
        className="shrink-0 w-7 h-7 rounded-lg bg-orange-50 hover:bg-[#FE6712] text-[#FE6712] hover:text-white flex items-center justify-center transition border border-orange-200"
      >
        {campoCopiado === campo ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function PagoPublicoPage() {
  const params = useParams();
  const token = params?.token;

  const [pago, setPago] = useState(null);
  const [config, setConfig] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [enviado, setEnviado] = useState(false);

  const [referencia, setReferencia] = useState("");
  const [bancoEmisor, setBancoEmisor] = useState("");
  const [error, setError] = useState("");
  const [campoCopiado, setCampoCopiado] = useState("");

  useEffect(() => {
    try {
      const configGuardada = JSON.parse(localStorage.getItem("duna_config_pagomovil") || "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
      setConfig(configGuardada);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Escucha en tiempo real (Firestore en vivo, o polling local) la intención de pago de este token
  useEffect(() => {
    return escucharDocumento("duna_pagos_pendientes", token, (match) => {
      setPago(match);
      if (match && match.status !== "PENDIENTE") {
        setEnviado(true);
        setReferencia(match.referenciaReportada || "");
      }
      setCargando(false);
    }, 2000);
  }, [token]);

  // Los datos receptores vienen en el propio pago (el teléfono del cliente no tiene la configuración de la caja)
  const datosCobro = pago?.datosCobro || config;
  const bancoReceptorInfo = bancosVenezuela.find((b) => b.codigo === datosCobro?.bancoReceptor) || null;

  const copiar = async (texto, campo) => {
    try {
      await navigator.clipboard.writeText(String(texto));
      setCampoCopiado(campo);
      setTimeout(() => setCampoCopiado(""), 1500);
    } catch (e) {
      console.warn("No se pudo copiar automáticamente.");
    }
  };

  const copiarTodo = () => {
    const texto = [
      `Banco: ${bancoReceptorInfo ? bancoReceptorInfo.display : "Sin configurar"}`,
      `Teléfono: ${datosCobro?.telefonoReceptor || "Sin configurar"}`,
      `Cédula / RIF: ${datosCobro?.rifReceptor || "Sin configurar"}`,
      `Monto Exacto: Bs. ${formatearMontoBs(pago.montoBs)}`,
    ].join("\n");
    copiar(texto, "todo");
  };

  const handleConfirmarPago = (e) => {
    e.preventDefault();
    setError("");

    const refLimpia = referencia.trim();
    if (!/^\d{4,8}$/.test(refLimpia)) {
      setError("Ingresa un número de referencia válido (4 a 8 dígitos).");
      return;
    }
    if (!bancoEmisor) {
      setError("Selecciona el banco desde el que realizaste el pago.");
      return;
    }

    actualizarDocumento("duna_pagos_pendientes", token, {
      status: "REPORTADO",
      referenciaReportada: refLimpia,
      bancoEmisorReportado: bancoEmisor,
    })
      .then(() => setEnviado(true))
      .catch(() => setError("Ocurrió un error al enviar tu comprobante. Intenta nuevamente."));
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
      </div>
    );
  }

  if (!pago) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 max-w-sm w-full text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
          <h1 className="text-sm font-black text-slate-900">Link no válido</h1>
          <p className="text-xs text-slate-500">Este enlace de pago no existe o ya expiró. Solicita uno nuevo al comercio.</p>
        </div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 max-w-sm w-full text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <Check className="w-7 h-7" />
          </div>
          <h1 className="text-base font-black text-slate-900">✓ Comprobante enviado</h1>
          <p className="text-xs text-slate-500 leading-relaxed">Su factura está siendo validada en caja.</p>
          {referencia && (
            <p className="text-[11px] text-slate-400">Referencia reportada: <span className="font-bold text-slate-700">{referencia}</span></p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center font-sans">
      <div className="w-full max-w-sm flex-1 space-y-2.5 p-3">

        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#FE6712] text-white flex items-center justify-center font-black text-xs">D&apos;</div>
            <h1 className="text-xs font-black text-slate-900 truncate">{datosCobro?.nombreTitular || "Pago Móvil"}</h1>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-1.5">Total a Pagar</p>
          <div className="leading-tight">
            <span className="text-3xl font-black font-mono text-slate-900">Bs. {formatearMontoBs(pago.montoBs)}</span>
            <span className="text-xs text-slate-400 font-bold font-mono ml-2">≈ ${Number(pago.montoUsd || 0).toFixed(2)} USD</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Datos para tu Pago Móvil</h2>
            <button
              type="button"
              onClick={copiarTodo}
              className="shrink-0 px-2.5 py-1 rounded-full bg-orange-50 hover:bg-[#FE6712] text-[#FE6712] hover:text-white border border-orange-200 text-[10px] font-black transition whitespace-nowrap"
            >
              {campoCopiado === "todo" ? "✓ ¡Copiado!" : "📋 Copiar Todo"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CeldaCopiable etiqueta="Banco" valor={bancoReceptorInfo ? bancoReceptorInfo.display : "Sin configurar"} campo="banco" campoCopiado={campoCopiado} onCopiar={copiar} />
            <CeldaCopiable etiqueta="Teléfono" valor={datosCobro?.telefonoReceptor || "Sin configurar"} campo="telefono" campoCopiado={campoCopiado} onCopiar={copiar} />
            <CeldaCopiable etiqueta="Cédula / RIF" valor={datosCobro?.rifReceptor || "Sin configurar"} campo="rif" campoCopiado={campoCopiado} onCopiar={copiar} />
            <CeldaCopiable etiqueta="Monto exacto" valor={`Bs. ${formatearMontoBs(pago.montoBs)}`} campo="monto" campoCopiado={campoCopiado} onCopiar={copiar} />
          </div>
        </div>

        <form id="form-pago" onSubmit={handleConfirmarPago} className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Reporta tu Pago</h2>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Nº de Referencia *</label>
              <input
                type="text"
                inputMode="numeric"
                required
                minLength={4}
                maxLength={8}
                value={referencia}
                onChange={(e) => setReferencia(e.target.value.replace(/\D/g, ""))}
                placeholder="1234"
                className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold font-mono text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Banco Emisor *</label>
              <select
                required
                value={bancoEmisor}
                onChange={(e) => setBancoEmisor(e.target.value)}
                className="w-full px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
              >
                <option value="">Banco...</option>
                {bancosVenezuela.map((b) => (
                  <option key={b.codigo} value={b.codigo}>{b.display}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="text-[11px] text-rose-600 font-bold text-center">{error}</p>
          )}

        </form>
      </div>

      <div className="sticky bottom-0 w-full max-w-sm bg-white border-t border-slate-200 p-3">
        <button
          type="submit"
          form="form-pago"
          className="w-full py-3 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-sm font-black transition shadow-sm shadow-orange-500/20 disabled:opacity-50"
        >
          Reportar Pago
        </button>
      </div>
    </div>
  );
}

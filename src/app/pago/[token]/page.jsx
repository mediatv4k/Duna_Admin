"use client";
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Copy, Check, Camera, Loader2, AlertCircle } from "lucide-react";
import bancosVenezuela from "@/data/bancosVenezuela";
import { escucharDocumento, actualizarDocumento } from "@/lib/firebase";

function formatearMontoBs(monto) {
  return (Number(monto) || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Reduce la foto del comprobante a un JPEG liviano en Base64 antes de guardarla
function comprimirImagen(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = (evt) => {
      const img = new window.Image();
      img.onload = () => {
        const maxAncho = 900;
        const escala = Math.min(1, maxAncho / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = evt.target.result;
    };
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.readAsDataURL(file);
  });
}

function FilaCopiable({ etiqueta, valor, campo, campoCopiado, onCopiar }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide block">{etiqueta}</span>
        <span className="text-sm font-black text-slate-900 truncate block">{valor}</span>
      </div>
      <button
        type="button"
        onClick={() => onCopiar(valor, campo)}
        className="shrink-0 w-9 h-9 rounded-xl bg-orange-50 hover:bg-[#FE6712] text-[#FE6712] hover:text-white flex items-center justify-center transition border border-orange-200"
      >
        {campoCopiado === campo ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
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
  const [imagenPreview, setImagenPreview] = useState("");
  const [comprimiendo, setComprimiendo] = useState(false);
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
        setImagenPreview(match.imagenComprobante || "");
      }
      setCargando(false);
    }, 2000);
  }, [token]);

  const bancoReceptorInfo = bancosVenezuela.find((b) => b.codigo === config?.bancoReceptor) || null;

  const copiar = async (texto, campo) => {
    try {
      await navigator.clipboard.writeText(String(texto));
      setCampoCopiado(campo);
      setTimeout(() => setCampoCopiado(""), 1500);
    } catch (e) {
      console.warn("No se pudo copiar automáticamente.");
    }
  };

  const handleArchivoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setComprimiendo(true);
    setError("");
    try {
      const base64 = await comprimirImagen(file);
      setImagenPreview(base64);
    } catch (err) {
      setError("No se pudo procesar la imagen. Intenta con otra foto.");
    } finally {
      setComprimiendo(false);
    }
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
      imagenComprobante: imagenPreview || null,
      bancoEmisorReportado: bancoEmisor,
    })
      .then(() => setEnviado(true))
      .catch(() => setError("Ocurrió un error al enviar tu comprobante. Intenta nuevamente."));
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
      </div>
    );
  }

  if (!pago) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 max-w-sm w-full text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <Check className="w-7 h-7" />
          </div>
          <h1 className="text-base font-black text-slate-900">✓ Comprobante enviado</h1>
          <p className="text-xs text-slate-500 leading-relaxed">Su factura está siendo validada en caja.</p>
          {imagenPreview && (
            /* eslint-disable-next-line @next/next/no-img-element -- imagen Base64 subida por el propio usuario, incompatible con next/image */
            <img src={imagenPreview} alt="Comprobante enviado" className="w-full rounded-2xl border border-slate-200 mt-2" />
          )}
          {referencia && (
            <p className="text-[11px] text-slate-400">Referencia reportada: <span className="font-bold text-slate-700">{referencia}</span></p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 font-sans">
      <div className="w-full max-w-sm space-y-4 py-6">

        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-[#FE6712] text-white flex items-center justify-center mx-auto font-black text-lg shadow-md shadow-orange-500/20">
            D&apos;
          </div>
          <h1 className="text-sm font-black text-slate-900">{config?.nombreTitular || "Pago Móvil"}</h1>
          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide pt-1">Total a Pagar</p>
          <div className="text-3xl font-black text-slate-900">Bs. {formatearMontoBs(pago.montoBs)}</div>
          <p className="text-xs text-slate-400 font-bold">≈ ${Number(pago.montoUsd || 0).toFixed(2)} USD</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
          <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">Datos para tu Pago Móvil</h2>
          <FilaCopiable etiqueta="Banco" valor={bancoReceptorInfo ? bancoReceptorInfo.display : "Sin configurar"} campo="banco" campoCopiado={campoCopiado} onCopiar={copiar} />
          <FilaCopiable etiqueta="Teléfono" valor={config?.telefonoReceptor || "Sin configurar"} campo="telefono" campoCopiado={campoCopiado} onCopiar={copiar} />
          <FilaCopiable etiqueta="Cédula / RIF" valor={config?.rifReceptor || "Sin configurar"} campo="rif" campoCopiado={campoCopiado} onCopiar={copiar} />
          <FilaCopiable etiqueta="Monto exacto" valor={`Bs. ${formatearMontoBs(pago.montoBs)}`} campo="monto" campoCopiado={campoCopiado} onCopiar={copiar} />
        </div>

        <form onSubmit={handleConfirmarPago} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 space-y-3">
          <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Reporta tu Pago</h2>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Número de Referencia *</label>
            <input
              type="text"
              inputMode="numeric"
              required
              minLength={4}
              maxLength={8}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value.replace(/\D/g, ""))}
              placeholder="1234"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Banco Emisor (desde el que pagaste)</label>
            <select
              required
              value={bancoEmisor}
              onChange={(e) => setBancoEmisor(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
            >
              <option value="">Seleccionar banco...</option>
              {bancosVenezuela.map((b) => (
                <option key={b.codigo} value={b.codigo}>{b.display}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Foto del Comprobante</label>
            <label className="w-full px-3 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-[#FE6712] transition">
              <input type="file" accept="image/*" capture="environment" onChange={handleArchivoChange} className="hidden" />
              {comprimiendo ? (
                <Loader2 className="w-5 h-5 text-[#FE6712] animate-spin" />
              ) : imagenPreview ? (
                /* eslint-disable-next-line @next/next/no-img-element -- imagen Base64 subida por el propio usuario, incompatible con next/image */
                <img src={imagenPreview} alt="Vista previa del comprobante" className="w-full max-h-40 rounded-lg object-contain" />
              ) : (
                <>
                  <Camera className="w-5 h-5 text-slate-400" />
                  <span className="text-[11px] text-slate-400 font-semibold">Toca para subir la captura</span>
                </>
              )}
            </label>
          </div>

          {error && (
            <p className="text-[11px] text-rose-600 font-bold text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={comprimiendo}
            className="w-full py-3 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-sm font-black transition shadow-sm shadow-orange-500/20 disabled:opacity-50"
          >
            Confirmar Pago
          </button>
        </form>
      </div>
    </div>
  );
}

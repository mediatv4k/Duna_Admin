"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Lock, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { user, perfil, loading, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Ya hay sesión activa (recién iniciada o restaurada): redirige según el rol
  useEffect(() => {
    if (loading || !user) return;
    router.replace(perfil?.rol === "cajero" ? "/pos" : "/");
  }, [loading, user, perfil, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    // Atajo de acceso rápido: escribir solo "admin" autocompleta el correo del usuario semilla
    const correoFinal = email.trim().toLowerCase() === "admin" ? "admin@duna.com" : email.trim();
    const resultado = await login(correoFinal, password);
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error || "No se pudo iniciar sesión.");
    }
  };

  if (loading || user) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center p-4 font-sans relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#FE6712]/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-[#FE6712]/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm space-y-6 relative z-10">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-[#FE6712] text-white flex items-center justify-center mx-auto font-black text-xl shadow-lg shadow-orange-500/20">
            D&apos;
          </div>
          <h1 className="text-lg font-black text-white">D&apos;una Admin</h1>
          <p className="text-xs text-slate-400">Inicia sesión para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 shadow-2xl space-y-4">
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Correo Electrónico</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin"
                autoComplete="email"
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="admin123"
                autoComplete="current-password"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-1.5 text-[11px] text-rose-600 font-bold bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-center text-[10px] text-slate-400 font-medium">
            Usuario: <span className="font-bold text-slate-600">admin</span> · Clave: <span className="font-bold text-slate-600">admin123</span>
          </p>

          <button
            type="submit"
            disabled={enviando}
            className="w-full py-3 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-sm font-black transition shadow-sm shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Iniciar Sesión"}
          </button>
        </form>

        <p className="text-center text-[10px] text-slate-500">Sistema administrativo multi-tienda D&apos;una Marketplace</p>
      </div>
    </div>
  );
}

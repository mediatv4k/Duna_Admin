"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, User } from "lucide-react";
import { iniciarSesionComercio } from "@/lib/commerceServices";

export default function ComerciosLoginPage() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user.trim() || !password.trim()) {
      setError("Indica tu usuario y tu contraseña.");
      return;
    }
    setError("");
    setCargando(true);
    try {
      await iniciarSesionComercio(user.trim(), password);
      router.push("/comercios/productos");
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#FE6712] text-white flex items-center justify-center mx-auto font-black text-lg shadow-sm shadow-orange-500/20">
            D&apos;
          </div>
          <h1 className="text-base font-black text-slate-900 mt-3">Portal de Aliados Comerciales</h1>
          <p className="text-xs text-slate-400 font-medium mt-1">Inicia sesión con tu cuenta de comercio</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Usuario</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="usuario@comercio.com"
                autoComplete="username"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FE6712] transition"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FE6712] transition"
              />
            </div>
          </div>

          {error && (
            <p className="text-[11px] text-rose-600 font-bold text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full py-3 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-sm font-black transition shadow-sm shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {cargando ? "Ingresando..." : "Iniciar Sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}

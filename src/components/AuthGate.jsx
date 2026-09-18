"use client";
import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Portales públicos (sin sesión de administración): autoservicio de pago y aprobación del supervisor por PIN/QR
function esRutaPublica(pathname) {
  if (!pathname) return false;
  if (pathname === "/login") return true;
  if (pathname.startsWith("/pago/")) return true;
  if (pathname.startsWith("/supervisor")) return true;
  return false;
}

export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const publica = esRutaPublica(pathname);

  useEffect(() => {
    if (loading || publica) return;
    if (!user) router.replace("/login");
  }, [loading, publica, user, router]);

  if (publica) return children;

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
      </div>
    );
  }

  return children;
}

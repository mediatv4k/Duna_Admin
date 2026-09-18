"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, getDocs, collection } from "firebase/firestore";
import { auth, db, firebaseHabilitado, setEmpresaActiva } from "@/lib/firebase";

// Identidad usada como sesión simulada en modo local (sin Firebase configurado) y como
// usuario maestro sembrado en Firestore la primera vez que la app arranca sin usuarios.
const USUARIO_SEMILLA = {
  uid: "dev-local",
  email: "admin@duna.com",
  nombre: "Administrador",
  rol: "superadmin",
  empresa_id: "cabimas_matriz",
  sede: "Cabimas Matriz",
};

const PASSWORD_SEMILLA = "admin123";

const AuthContext = createContext(null);

// Crea el primer usuario maestro (Auth + perfil en duna_usuarios) si la colección está vacía.
// Es un no-op seguro: si ya existe algún usuario, o si las reglas de Firestore no permiten
// la lectura sin sesión, simplemente no hace nada.
async function inicializarUsuarioSemilla() {
  if (!firebaseHabilitado) return;
  try {
    const snap = await getDocs(collection(db, "duna_usuarios"));
    if (!snap.empty) return;

    let uid;
    try {
      const credencial = await createUserWithEmailAndPassword(auth, USUARIO_SEMILLA.email, PASSWORD_SEMILLA);
      uid = credencial.user.uid;
    } catch (e) {
      // La cuenta de Auth ya existe pero su perfil no está en duna_usuarios: no podemos
      // conocer su uid sin iniciar sesión, así que dejamos que el propio login lo resuelva.
      return;
    }

    await setDoc(doc(db, "duna_usuarios", uid), {
      nombre: USUARIO_SEMILLA.nombre,
      email: USUARIO_SEMILLA.email,
      rol: USUARIO_SEMILLA.rol,
      empresa_id: USUARIO_SEMILLA.empresa_id,
      sede: USUARIO_SEMILLA.sede,
    });
  } catch (e) {
    console.error("No se pudo inicializar el usuario semilla:", e);
  }
}

function mapearErrorAuth(error) {
  const codigo = error?.code;
  if (codigo === "auth/wrong-password" || codigo === "auth/invalid-credential") {
    return "Contraseña incorrecta o credenciales inválidas";
  }
  if (codigo === "auth/user-not-found") {
    return "Usuario no encontrado";
  }
  return error?.message || codigo || "No se pudo iniciar sesión.";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseHabilitado) {
      // Fallback de desarrollo: sesión simulada configurable vía localStorage (duna_sesion_simulada)
      let simulada = USUARIO_SEMILLA;
      try {
        const guardada = localStorage.getItem("duna_sesion_simulada");
        if (guardada) {
          simulada = { ...USUARIO_SEMILLA, ...JSON.parse(guardada) };
        } else {
          localStorage.setItem("duna_sesion_simulada", JSON.stringify(USUARIO_SEMILLA));
        }
      } catch (e) {
        console.error(e);
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
      setUser({ uid: simulada.uid, email: simulada.email });
      setPerfil(simulada);
      setEmpresaActiva(simulada.empresa_id);
      setLoading(false);
      return undefined;
    }

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setPerfil(null);
        setEmpresaActiva(null);
        setLoading(false);
        inicializarUsuarioSemilla().catch((e) => console.error(e));
        return;
      }
      setUser(fbUser);
      try {
        const ref = doc(db, "duna_usuarios", fbUser.uid);
        const snap = await getDoc(ref);
        let datos;
        if (snap.exists()) {
          datos = snap.data();
        } else {
          // Cuenta de Auth válida sin perfil todavía: se autogenera en el momento, sin cortar la sesión
          datos = {
            uid: fbUser.uid,
            email: fbUser.email,
            nombre: "Omar Soto",
            rol: "superadmin",
            empresa_id: "cabimas_matriz",
            sede: "Cabimas",
            creado_en: new Date().toISOString(),
          };
          await setDoc(ref, datos);
        }
        const perfilResuelto = {
          uid: fbUser.uid,
          email: fbUser.email,
          nombre: datos.nombre || fbUser.email,
          rol: datos.rol || "cajero",
          empresa_id: datos.empresa_id || null,
          sede: datos.sede || "",
        };
        setPerfil(perfilResuelto);
        setEmpresaActiva(perfilResuelto.empresa_id);
      } catch (e) {
        console.error(e);
        setPerfil(null);
        setEmpresaActiva(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = useCallback(async (email, password) => {
    if (!firebaseHabilitado) {
      return { ok: true };
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: mapearErrorAuth(e) };
    }
  }, []);

  const logout = useCallback(async () => {
    if (firebaseHabilitado) {
      await signOut(auth);
    } else {
      setUser(null);
      setPerfil(null);
      setEmpresaActiva(null);
    }
  }, []);

  const value = {
    user,
    perfil,
    loading,
    empresaId: perfil?.empresa_id || null,
    rol: perfil?.rol || null,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

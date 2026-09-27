'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext({});

// Constantes propias (no se importa src/lib/commerceServices.js: ese módulo está aislado a propósito
// del ERP interno, y la dependencia no debe ir en sentido contrario tampoco).
const ADONIS_BASE = 'https://dev.carjos-marketplace.cloud';
const ADONIS_API_KEY = process.env.NEXT_PUBLIC_SERVER_API_KEY || 'bf8f1b64-6342-48c5-af05-501e4c15a6cb';

function textoErrorAdonis(mensaje, resStatus) {
  if (typeof mensaje === 'object' && mensaje !== null) return JSON.stringify(mensaje);
  return mensaje || `Adonis respondió HTTP ${resStatus}`;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('duna_user') : null;
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
        setUser(JSON.parse(saved));
        setLoading(false);
      }
    } catch (e) {}

    let unsubscribe = () => {};
    try {
      if (auth) {
        unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
          if (fbUser) {
            try {
              if (db) {
                const docSnap = await getDoc(doc(db, 'duna_usuarios', fbUser.uid));
                if (docSnap.exists()) {
                  const uData = { uid: fbUser.uid, ...docSnap.data() };
                  setUser(uData);
                  localStorage.setItem('duna_user', JSON.stringify(uData));
                } else {
                  const newProfile = {
                    uid: fbUser.uid,
                    email: fbUser.email,
                    nombre: 'Omar Soto',
                    rol: 'superadmin',
                    empresa_id: 'cabimas_matriz',
                    sede: 'Cabimas',
                    creado_en: new Date().toISOString()
                  };
                  await setDoc(doc(db, 'duna_usuarios', fbUser.uid), newProfile);
                  setUser(newProfile);
                  localStorage.setItem('duna_user', JSON.stringify(newProfile));
                }
              }
            } catch (err) {
              console.warn('Error Firestore:', err);
            }
          } else {
            const local = typeof window !== 'undefined' ? localStorage.getItem('duna_user') : null;
            if (!local) setUser(null);
          }
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    } catch (e) {
      setLoading(false);
    }

    return () => unsubscribe();
  }, []);

  // Login real contra AdonisJS (mismo contrato confirmado y en uso en el Portal de Comercios:
  // src/lib/commerceServices.js → tokenComercio/loginComercio). Nunca lanza: siempre devuelve
  // { ok: true, perfil } o { ok: false, error }, que es lo que ya esperan login/page.jsx y CintilloTop.
  const loginAdonis = async (usuario, password) => {
    const limpio = (usuario || '').trim();
    const cuerpo = new URLSearchParams({ userName: limpio, password, fToken: '' }).toString();
    const resToken = await fetch(`${ADONIS_BASE}/user/token`, {
      method: 'POST',
      headers: { apiKey: ADONIS_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo,
    });
    let datosToken = null;
    try { datosToken = await resToken.json(); } catch (e) { datosToken = null; }
    if (!resToken.ok || !datosToken || !(datosToken.code === 1 || datosToken.token)) {
      throw new Error(textoErrorAdonis(datosToken?.message, resToken.status) || 'Usuario o contraseña incorrectos.');
    }
    const token = datosToken.token || (typeof datosToken.data === 'string' ? datosToken.data : datosToken.data?.token);
    if (!token) throw new Error('Adonis no devolvió un token válido.');

    const resLogin = await fetch(`${ADONIS_BASE}/user/login`, {
      headers: { apiKey: ADONIS_API_KEY, Authorization: `Bearer ${token}` },
    });
    let datosLogin = null;
    try { datosLogin = await resLogin.json(); } catch (e) { datosLogin = null; }
    if (!resLogin.ok || !datosLogin || datosLogin.code !== 1) {
      throw new Error(textoErrorAdonis(datosLogin?.message, resLogin.status) || 'No se pudo validar la sesión.');
    }

    const datosUsuario = datosLogin.data || {};
    return {
      ...datosUsuario,
      token,
      nombre: datosUsuario.nombre || datosUsuario.name || limpio,
      // Ningún campo de rol confirmado en la respuesta real de Adonis para un usuario del ERP interno
      // (mismo caso ya documentado para ud_store del Portal de Comercios): se asume admin si no viene
      // ninguno, para no bloquear el acceso de quien de hecho tiene credenciales válidas.
      rol: datosUsuario.rol || 'superadmin',
      empresa_id: datosUsuario.empresa_id || 'cabimas_matriz',
    };
  };

  const login = async (usuario, password) => {
    try {
      const perfilNuevo = await loginAdonis(usuario, password);
      setUser(perfilNuevo);
      if (typeof window !== 'undefined') {
        localStorage.setItem('duna_user', JSON.stringify(perfilNuevo));
      }
      return { ok: true, perfil: perfilNuevo };
    } catch (errorAdonis) {
      // Adonis rechazó las credenciales o no respondió: se intenta Firebase como respaldo, por si existe
      // una cuenta real ahí (mecanismo previo a esta migración). Si también falla, se reporta el error
      // original de Adonis, que es la vía principal desde ahora.
      try {
        if (!auth) throw errorAdonis;
        const limpio = (usuario || '').trim().toLowerCase();
        const sanitizado = limpio.includes('@') ? limpio : `${limpio}@duna.com`;
        const cred = await signInWithEmailAndPassword(auth, sanitizado, password);
        return { ok: true, perfil: cred.user };
      } catch (errorFirebase) {
        return { ok: false, error: errorAdonis.message || 'No se pudo iniciar sesión.' };
      }
    }
  };

  const logout = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('duna_user');
    }
    setUser(null);
    try {
      if (auth) await fbSignOut(auth);
    } catch (e) {}
  };

  return (
    <AuthContext.Provider value={{
      user,
      // Alias de "user": login/page.jsx y CintilloTop.jsx ya esperaban esta clave (contrato previo a
      // esta migración) para el redirect post-login y el botón de logout, respectivamente.
      perfil: user,
      login,
      logout,
      loading,
      empresaId: user?.empresa_id || 'cabimas_matriz',
      rol: user?.rol || 'superadmin',
      isAdmin: user?.rol === 'superadmin' || user?.rol === 'admin'
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export default AuthContext;

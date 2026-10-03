'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext({});

// Constantes propias (no se importa src/lib/commerceServices.js: ese módulo está aislado a propósito
// del ERP interno, y la dependencia no debe ir en sentido contrario tampoco).
const ADONIS_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://dev.carjos-marketplace.cloud';
const ADONIS_API_KEY = process.env.NEXT_PUBLIC_SERVER_API_KEY || 'bf8f1b64-6342-48c5-af05-501e4c15a6cb';

// Rol de quien no trae un rol administrativo. Antes, quien no traía `rol` quedaba como 'superadmin': cualquier
// cuenta con credenciales válidas pasaba por administrador. Ahora el rol sale de `roles` en la respuesta de
// GET /user/login (texto, p. ej. "ADMINISTRATOR" para el Administrador General; payload real aportado por el
// equipo el 2026-10-03) y, si no viene, queda el rol raso: nunca se asume administrador por omisión.
const ROL_POR_DEFECTO = 'vendedor';

function textoErrorAdonis(mensaje, resStatus) {
  if (typeof mensaje === 'object' && mensaje !== null) return JSON.stringify(mensaje);
  return mensaje || `Adonis respondió HTTP ${resStatus}`;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Autenticación exclusiva contra Adonis: no hay ningún otro proveedor de identidad que restaurar al
  // montar. Firebase quedó retirado por completo de este archivo (ver fix posterior a esta migración):
  // en producción (Vercel), con una API key de Firebase inválida o sin configurar, incluso el simple
  // listener de sesión de Firebase (sin que nadie llegara a usar su login) intentaba refrescar un token
  // contra sus servidores y fallaba con "API key no válida". Sacarlo de aquí elimina esa fuente de error
  // de raíz. src/lib/firebase.js sigue existiendo e intacto para Firestore en el resto del ERP
  // (supervisor, pagos móviles, etc.) — solo se retiró su uso para AUTENTICACIÓN en este archivo.
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('duna_user') : null;
      const guardado = saved ? JSON.parse(saved) : null;
      if (guardado && typeof guardado === 'object') {
        // El rol se vuelve a derivar de `roles`, que el perfil conserva tal cual lo entregó Adonis: las sesiones
        // guardadas antes de este cambio llevan rol 'superadmin' por el fallback antiguo, fuera quien fuera su dueño.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
        setUser({ ...guardado, rol: guardado.roles || ROL_POR_DEFECTO });
      }
    } catch (e) {}
    setLoading(false);
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
      // El rol viene en `roles` (texto, p. ej. "ADMINISTRATOR"); sin él, el rol raso (ver ROL_POR_DEFECTO).
      // El token no se toca: sigue viajando en este mismo perfil, que se guarda en duna_user (aparte de iac_store).
      rol: datosUsuario.roles || ROL_POR_DEFECTO,
      empresa_id: datosUsuario.empresa_id || 'cabimas_matriz',
    };
  };

  // Sin respaldo de ningún otro proveedor: si Adonis rechaza o no responde, el error se devuelve tal
  // cual al formulario de login. No hay segundo intento que pueda enmascararlo ni fallar por su cuenta.
  const login = async (usuario, password) => {
    try {
      const perfilNuevo = await loginAdonis(usuario, password);
      setUser(perfilNuevo);
      if (typeof window !== 'undefined') {
        localStorage.setItem('duna_user', JSON.stringify(perfilNuevo));
      }
      return { ok: true, perfil: perfilNuevo };
    } catch (errorAdonis) {
      return { ok: false, error: errorAdonis.message || 'No se pudo iniciar sesión.' };
    }
  };

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('duna_user');
    }
    setUser(null);
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
      rol: user?.rol || ROL_POR_DEFECTO,
      // Comparación exacta con el valor de Adonis ("ADMINISTRATOR"); 'superadmin' se conserva por compatibilidad
      isAdmin: user?.rol === 'ADMINISTRATOR' || user?.rol === 'superadmin'
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export default AuthContext;

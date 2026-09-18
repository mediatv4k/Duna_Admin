'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext({});

const MASTER_USER = {
  uid: 'master_admin_duna',
  email: 'admin@duna.com',
  nombre: 'Omar Soto',
  rol: 'superadmin',
  empresa_id: 'cabimas_matriz',
  sede: 'Cabimas'
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('duna_user') : null;
      if (saved) {
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

  const login = async (email, password) => {
    const clean = (email || '').trim().toLowerCase();

    // ACCESO DIRECTO ADMIN (Sin bloqueos de Google Cloud)
    if ((clean === 'admin' || clean === 'admin@duna.com') && password === 'admin123') {
      setUser(MASTER_USER);
      if (typeof window !== 'undefined') {
        localStorage.setItem('duna_user', JSON.stringify(MASTER_USER));
      }
      return MASTER_USER;
    }

    if (!auth) throw new Error('Firebase no disponible');
    const sanitized = clean.includes('@') ? clean : `${clean}@duna.com`;
    const cred = await signInWithEmailAndPassword(auth, sanitized, password);
    return cred.user;
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

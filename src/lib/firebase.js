// Inicializador de Firebase + helpers universales de sincronización.
//
// Si las variables NEXT_PUBLIC_FIREBASE_* no están configuradas, todos los
// helpers degradan suavemente hacia localStorage (con polling + evento
// "storage" para simular tiempo real entre pestañas), de modo que el
// sistema sigue funcionando 100% offline/local sin romper nada.

import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Solo se activa Firebase si las variables mínimas están presentes; si no, todo opera en modo local.
export const firebaseHabilitado = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let app = null;
export let db = null;

if (firebaseHabilitado) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
}

// --- Fallback local (colección = array JSON bajo una sola clave de localStorage) ---

function leerColeccionLocal(nombre) {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(nombre) || "[]");
  } catch (e) {
    console.error(e);
    return [];
  }
}

function escribirColeccionLocal(nombre, items) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(nombre, JSON.stringify(items));
}

// --- Helpers universales ---

/**
 * Escucha una colección completa en tiempo real.
 * Firebase: onSnapshot(collection(db, nombre)). Local: emisión inmediata + polling + evento "storage".
 * Devuelve una función para cancelar la suscripción.
 */
export function escucharColeccion(nombre, onCambio, intervaloMs = 1500) {
  if (firebaseHabilitado) {
    return onSnapshot(collection(db, nombre), (snap) => {
      onCambio(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }
  onCambio(leerColeccionLocal(nombre));
  const intervalo = setInterval(() => onCambio(leerColeccionLocal(nombre)), intervaloMs);
  const handleStorage = (e) => {
    if (!e.key || e.key === nombre) onCambio(leerColeccionLocal(nombre));
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    clearInterval(intervalo);
    window.removeEventListener("storage", handleStorage);
  };
}

/**
 * Escucha un único documento en tiempo real (por id).
 * Firebase: onSnapshot(doc(db, nombre, id)). Local: emisión inmediata + polling + evento "storage".
 * Devuelve una función para cancelar la suscripción.
 */
export function escucharDocumento(nombre, id, onCambio, intervaloMs = 1500) {
  if (!id) {
    onCambio(null);
    return () => {};
  }
  if (firebaseHabilitado) {
    return onSnapshot(doc(db, nombre, id), (snap) => {
      onCambio(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }
  const leer = () => {
    const items = leerColeccionLocal(nombre);
    onCambio(items.find((it) => it.id === id) || null);
  };
  leer();
  const intervalo = setInterval(leer, intervaloMs);
  const handleStorage = (e) => {
    if (!e.key || e.key === nombre) leer();
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    clearInterval(intervalo);
    window.removeEventListener("storage", handleStorage);
  };
}

/** Trae una colección completa una sola vez (sin listener). Firebase: getDocs. Local: lectura directa. */
export async function obtenerColeccion(nombre) {
  if (firebaseHabilitado) {
    const snap = await getDocs(collection(db, nombre));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return leerColeccionLocal(nombre);
}

/** Crea o reemplaza un documento (upsert) por id, en Firestore y en el espejo local. */
export async function guardarDocumento(nombre, id, datos) {
  const item = { ...datos, id };
  const items = leerColeccionLocal(nombre);
  const idx = items.findIndex((it) => it.id === id);
  escribirColeccionLocal(nombre, idx >= 0 ? items.map((it, i) => (i === idx ? item : it)) : [item, ...items]);
  if (firebaseHabilitado) {
    await setDoc(doc(db, nombre, id), datos);
  }
}

/** Actualiza (merge parcial) los campos de un documento existente, en Firestore y en el espejo local. */
export async function actualizarDocumento(nombre, id, cambios) {
  const items = leerColeccionLocal(nombre);
  escribirColeccionLocal(nombre, items.map((it) => (it.id === id ? { ...it, ...cambios } : it)));
  if (firebaseHabilitado) {
    await updateDoc(doc(db, nombre, id), cambios);
  }
}

/** Elimina un documento por id, en Firestore y en el espejo local. */
export async function eliminarDocumento(nombre, id) {
  const items = leerColeccionLocal(nombre).filter((it) => it.id !== id);
  escribirColeccionLocal(nombre, items);
  if (firebaseHabilitado) {
    await deleteDoc(doc(db, nombre, id));
  }
}

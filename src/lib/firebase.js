// Inicializador de Firebase + helpers universales de sincronización.
//
// La configuración se toma de las variables NEXT_PUBLIC_FIREBASE_* cuando están
// presentes, y si no (por ejemplo, un despliegue en Vercel sin esas variables
// configuradas) cae en los valores por defecto del proyecto duna-admin, para que
// la app quede conectada a Firebase igual. Solo si ninguna de las dos fuentes
// resuelve (caso extremo) los helpers degradan hacia localStorage.

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  doc,
  collection,
  query,
  where,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyC8TmDTcb43a2jkUJBOquibEUzgmPh8fiQ",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "duna-admin.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "duna-admin",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "duna-admin.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "18381986205",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:18381986205:web:02e6e7b3ed0395191db774",
};

// Solo se activa Firebase si las variables mínimas están presentes; si no, todo opera en modo local.
export const firebaseHabilitado = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let app = null;
export let db = null;
export let auth = null;

if (firebaseHabilitado) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}

// --- Partición multi-tenant (empresa_id) ---
//
// Las colecciones compartidas (productos, clientes, proveedores, etc.) se filtran
// y se etiquetan automáticamente con la empresa activa de la sesión, para que
// ningún comercio pueda leer ni escribir datos de otro. AuthContext llama a
// setEmpresaActiva() en cuanto resuelve el perfil del usuario autenticado.

let empresaActivaId = null;

export function setEmpresaActiva(id) {
  empresaActivaId = id || null;
}

export function getEmpresaActiva() {
  return empresaActivaId;
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
    const ref = empresaActivaId
      ? query(collection(db, nombre), where("empresa_id", "==", empresaActivaId))
      : collection(db, nombre);
    return onSnapshot(ref, (snap) => {
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
    const ref = empresaActivaId
      ? query(collection(db, nombre), where("empresa_id", "==", empresaActivaId))
      : collection(db, nombre);
    const snap = await getDocs(ref);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return leerColeccionLocal(nombre);
}

/** Crea o reemplaza un documento (upsert) por id, en Firestore y en el espejo local. Adjunta la empresa activa automáticamente. */
export async function guardarDocumento(nombre, id, datos) {
  const datosFinal = empresaActivaId ? { ...datos, empresa_id: empresaActivaId } : datos;
  const item = { ...datosFinal, id };
  const items = leerColeccionLocal(nombre);
  const idx = items.findIndex((it) => it.id === id);
  escribirColeccionLocal(nombre, idx >= 0 ? items.map((it, i) => (i === idx ? item : it)) : [item, ...items]);
  if (firebaseHabilitado) {
    await setDoc(doc(db, nombre, id), datosFinal);
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

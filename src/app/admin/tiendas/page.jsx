"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2, Lock, ArrowLeft, Search, Power, Check, X, AlertTriangle, RefreshCw, Plus,
  Boxes, MonitorPlay, BarChart3, Settings, Clock, CreditCard, LogOut, Store,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import SidebarTienda from "@/components/comercios/SidebarTienda";
import ConfiguracionGastronomica from "@/components/comercios/ConfiguracionGastronomica";
import FormularioNuevaTienda, { ID_SECCION_NUEVA_TIENDA } from "./FormularioNuevaTienda";

// ==============================================================================
// MASTER DE TIENDAS — DIRECTORIO CONECTADO A ADONIS (GET /store)
// ==============================================================================
// El listado sale de GET /store con la apiKey y el Bearer del administrador (useAuth().user.token): la misma
// llamada que ya hacen inventario/page.jsx (cargarTiendasAdonis) y comercios/productos/page.jsx
// (cargarTiendasComercio), duplicada aquí a propósito para no acoplar este módulo al portal de comercios.
// Lo que el servidor no entregue se rellena con valores por defecto, para que la tabla nunca reciba undefined.
//
// Sin sesión válida GET /store responde 401 {"errors":[{"message":"E_INVALID_API_TOKEN: Invalid API token"}]}
// (verificado el 2026-10-03); con sesión válida el mapeo sigue siendo defensivo. Campos de cada comercio, según el
// payload real aportado por el equipo el 2026-10-03: name (a veces null), manager (el representante; a veces
// vacío), phone (con prefijo 58), status y categories. status: OPEN, CLOSED y ACTIVE se muestran Activo e
// INACTIVE Suspendido. categories es un texto con ids separados por comas, y cada id es el UUID (`code`) o el
// número (`id`) de una categoría de GET /product/categories?unused=true, ruta pública (solo apiKey, sin Bearer)
// que se pide junto con las tiendas para traducirlos. No existe un campo de nicho: el nicho que se ve son esos
// nombres, sin repetir (los ids que el diccionario no conoce se descartan), o «Sin clasificar» si no queda
// ninguno. Esa traducción, y cualquier cambio de nicho hecho aquí, viven solo en esta vista.
//
// Ficha Gastronómica automática: el entorno del comercio muestra ConfiguracionGastronomica cuando el nicho que se ve
// menciona algún término de TERMINOS_GASTRONOMIA (sin distinguir mayúsculas) o, mientras el nicho siga siendo el
// que entregó el servidor, cuando lo menciona el grupo de sus categorías (campo `super` del diccionario, p. ej.
// «Comida»: sin él, entre las 23 categorías reales solo «Heladerías» activaría la ficha).
//
// Navegación por comercio: la tabla ya no tiene columna de acciones. El NOMBRE de cada comercio es el enlace para
// «entrar» en su entorno: siembra la misma sesión de relleno que sembraba «Entrar como comercio» (iac_store/ud_store)
// y cambia el contexto de esta misma página, sin recargar ni navegar, al entorno de ese comercio. Allí el menú lateral
// (MenuLateralComercio) lista sus opciones operativas (OPCIONES_COMERCIO) en lugar del menú general, con un botón para
// volver al directorio. Esas opciones enlazan a las vistas reales del portal, que no se tocaron: dentro de ellas sigue
// mandando su propio SidebarTienda. En el entorno vive también lo que abría el antiguo menú de acciones: editar la
// información básica, Suspender/Activar y la Ficha Gastronómica. Eso sigue siendo local: no escribe en el servidor.
//
// Nueva Tienda: el botón de la cabecera abre FormularioNuevaTienda (sección en línea, sin modal) con las categorías
// de este mismo diccionario. La creación es SIMULADA: no escribe en el servidor y lo «creado» solo vive en
// `tiendasCreadas` (estado de esta página), fuera de la tabla del directorio. Detalles en el encabezado del formulario.
//
// La guarda de acceso usa useAuth()/isAdmin (AuthContext, login real en /login) — NO
// localStorage.getItem("iac"), que no existe en ningún punto de este proyecto (el localStorage real del
// ERP interno es "duna_user", ver AuthContext.jsx; "iac_store" es un token distinto, del Portal de
// Comercios, sin relación con el acceso de administrador aquí).
//
// Vocabulario de nichos de comercios/productos/page.jsx (NICHOS): solo alimenta el selector manual de nicho del
// entorno del comercio. El filtro de nichos de la tabla lista las categorías reales de las tiendas cargadas.
const NICHOS_FILTRO = [
  "General",
  "Farmacia, Salud & Cuidado Personal",
  "Tecnología, Hogar & Ferretería",
  "Gastronomía & Heladería",
  "Granel / Peso",
  "Supermercado, Bodegones & Licores",
  "Moda, Calzado & Perfumería",
];

const ADONIS_BASE = "https://dev.carjos-marketplace.cloud";
// Mismos encabezados que inventario/page.jsx. La apiKey admite el override de entorno que ya usa AuthContext,
// que es quien emite el token: si algún día difieren, el token no valdría con otra clave.
const ADONIS_HEADERS = {
  apiKey: process.env.NEXT_PUBLIC_SERVER_API_KEY || "bf8f1b64-6342-48c5-af05-501e4c15a6cb",
  "Content-Type": "application/json",
};

const NO_REGISTRADO = "No registrado";
const SIN_CLASIFICAR = "Sin clasificar";
// Tope de páginas de GET /store: evita un bucle desbocado si el servidor devolviera un last_page absurdo
const MAX_PAGINAS_TIENDAS = 100;
// status de un comercio: OPEN, CLOSED y ACTIVE se muestran Activo; INACTIVE, Suspendido (regla confirmada por el
// equipo el 2026-10-03). Cualquier otro valor, o ninguno, también se muestra Activo: solo lo que el servidor
// marca como dado de baja se suspende.
const ESTATUS_SUSPENDIDOS = ["INACTIVE", "INACTIVO", "SUSPENDED", "SUSPENDIDO"];
// Términos que activan sola la Ficha Gastronómica (se buscan en minúsculas, con los acentos tal cual)
const TERMINOS_GASTRONOMIA = ["gastronomía", "restaurante", "heladería", "pizza", "comida", "café", "bebida", "yogurt"];
// Cuánto dura el aviso «Guardado en esta vista» del entorno del comercio
const AVISO_GUARDADO_MS = 4000;

// Texto limpio de un valor del servidor, o null si no es texto/número o viene vacío
const textoONulo = (valor) => {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  return String(valor).trim() || null;
};
// El primero de los candidatos que traiga contenido (el servidor a veces manda "" o null en el campo principal)
const primerTexto = (...candidatos) => {
  for (const candidato of candidatos) {
    const texto = textoONulo(candidato);
    if (texto) return texto;
  }
  return null;
};

// Traduce las categorías de un comercio (ids separados por comas: UUID y/o número) con el diccionario. Los nombres
// salen sin repetir y en orden de aparición; los ids que el diccionario no conoce se descartan. `grupos` reúne los
// grupos (campo `super`) de las categorías traducidas.
function traducirCategorias(valor, diccionario) {
  const fichas = Array.isArray(valor) ? valor : String(valor ?? "").split(",");
  const nombres = [];
  const grupos = [];
  for (const ficha of fichas) {
    const clave = textoONulo(ficha);
    const entrada = clave ? diccionario.get(clave.toLowerCase()) : undefined;
    if (!entrada) continue;
    if (!nombres.includes(entrada.nombre)) nombres.push(entrada.nombre);
    if (entrada.grupo && !grupos.includes(entrada.grupo)) grupos.push(entrada.grupo);
  }
  return { nombres, grupos };
}

const mencionaGastronomia = (texto) => {
  const minusculas = String(texto ?? "").toLowerCase();
  return TERMINOS_GASTRONOMIA.some((termino) => minusculas.includes(termino));
};
// El nicho que se ve decide; el grupo de las categorías solo cuenta mientras el nicho siga siendo el del servidor
// (si el administrador lo cambió a mano aquí, manda su elección).
const esGastronomia = (t) => mencionaGastronomia(t.nicho) || (t.nicho === t.nichoServidor && mencionaGastronomia(t.grupos));

// Convierte un comercio de Adonis al formato de la tabla. Devuelve null si no tiene id (no se puede operar
// sobre él). Todos los textos salen como string: la búsqueda y el filtro llaman toLowerCase() sobre ellos.
function mapearTienda(t, diccionario) {
  if (t === null || typeof t !== "object") return null;
  const id = t.id ?? t._id;
  if (id === undefined || id === null || id === "") return null;
  const { nombres, grupos } = traducirCategorias(t.categories, diccionario);
  const nicho = primerTexto(t.nicho, t.niche) ?? (nombres.length ? nombres.join(", ") : SIN_CLASIFICAR);
  return {
    id,
    // `code` (slug) de la tienda, en minúsculas: el formulario de Nueva Tienda lo usa para avisar de un código repetido
    codigo: (textoONulo(t.code) ?? "").toLowerCase(),
    nombre: primerTexto(t.name, t.nombre) ?? `Tienda #${id}`,
    nicho,
    nichoServidor: nicho,
    categorias: nombres,
    grupos: grupos.join(", "),
    representante: primerTexto(t.manager, t.representante, t.responsable) ?? NO_REGISTRADO,
    contacto: primerTexto(t.phone, t.telefono, t.contacto) ?? NO_REGISTRADO,
    estatus: ESTATUS_SUSPENDIDOS.includes(String(t.status ?? "").trim().toUpperCase()) ? "SUSPENDIDO" : "ACTIVO",
  };
}

// GET /store con la apiKey y el Bearer del administrador. La forma exacta de la respuesta no está confirmada,
// así que se busca el arreglo en las envolturas habituales (las mismas que ya prueban inventario y el portal)
// y se sigue la paginación si el servidor la anuncia. Si no hay ningún arreglo, es un error: un directorio
// vacío por no entender la respuesta engañaría más que un aviso. Devuelve los comercios tal como llegan; se
// mapean en cargarDirectorioAdonis.
async function cargarTiendasAdonis(token, signal) {
  const pedirPagina = async (pagina) => {
    const res = await fetch(`${ADONIS_BASE}/store${pagina > 1 ? `?page=${pagina}` : ""}`, {
      headers: { ...ADONIS_HEADERS, Authorization: `Bearer ${token}` },
      signal,
    });
    let datos = null;
    try {
      datos = await res.json();
    } catch (e) {
      datos = null;
    }
    if (!res.ok || !datos || (datos.code !== undefined && datos.code !== 1)) {
      // Adonis responde los errores de sesión como {"errors":[{"message"}]} y los demás como {"message"}
      const aTexto = (m) => (m !== null && typeof m === "object" ? JSON.stringify(m) : m);
      const detalle = aTexto(datos?.message) || aTexto(datos?.errors?.[0]?.message);
      const sesion = res.status === 401 || res.status === 403 ? " Tu sesión de administrador venció o no tiene permiso: cierra sesión y vuelve a entrar." : "";
      const base = String(detalle || `Adonis respondió HTTP ${res.status} al listar las tiendas`).replace(/[.\s]+$/, "");
      throw new Error(`${base}.${sesion}`);
    }
    return datos;
  };
  const extraerLista = (datos) => {
    const lista = [datos, datos.data, datos.data?.stores, datos.data?.stores?.data, datos.data?.data, datos.stores, datos.data?.rows].find(Array.isArray);
    if (!lista) throw new Error(`el servidor devolvió un formato que no se reconoce (${JSON.stringify(datos).slice(0, 120)}).`);
    return lista;
  };
  const ultimaPagina = (datos) =>
    Number(datos.meta?.last_page ?? datos.data?.meta?.last_page ?? datos.data?.stores?.meta?.last_page ?? datos.data?.last_page ?? datos.last_page) || 1;

  const primera = await pedirPagina(1);
  let crudas = extraerLista(primera);
  const paginas = Math.min(ultimaPagina(primera), MAX_PAGINAS_TIENDAS);
  for (let p = 2; p <= paginas; p++) {
    crudas = crudas.concat(extraerLista(await pedirPagina(p)));
  }

  return crudas;
}

// GET /product/categories?unused=true: ruta pública (solo apiKey, sin Bearer). Verificada el 2026-10-03: devuelve
// 23 categorías {id (número), code (UUID), name, super (grupo, p. ej. «Comida»), status…}, con espacios sobrantes
// en algunos nombres. Las tiendas citan sus categorías por `code` y, a veces, por `id`: el diccionario indexa por
// los dos (UUID en minúsculas).
async function cargarCategoriasAdonis(signal) {
  const res = await fetch(`${ADONIS_BASE}/product/categories?unused=true`, { headers: ADONIS_HEADERS, signal });
  let datos = null;
  try {
    datos = await res.json();
  } catch (e) {
    datos = null;
  }
  if (!res.ok || !datos || (datos.code !== undefined && datos.code !== 1)) {
    const aTexto = (m) => (m !== null && typeof m === "object" ? JSON.stringify(m) : m);
    const detalle = aTexto(datos?.message) || aTexto(datos?.errors?.[0]?.message) || `Adonis respondió HTTP ${res.status}`;
    throw new Error(`${String(detalle).replace(/[.\s]+$/, "")}.`);
  }
  const lista = [datos.data, datos.data?.categories, datos.data?.data, datos].find(Array.isArray);
  if (!lista) throw new Error(`el servidor devolvió un formato que no se reconoce (${JSON.stringify(datos).slice(0, 120)}).`);

  const diccionario = new Map();
  for (const categoria of lista) {
    const nombre = primerTexto(categoria?.name, categoria?.nombre);
    if (!nombre) continue;
    // id y codigo se conservan para el formulario de Nueva Tienda, que elige categorías y envía su código
    const entrada = { nombre, grupo: textoONulo(categoria.super) ?? "", id: textoONulo(categoria.id), codigo: textoONulo(categoria.code) };
    for (const clave of [categoria.code, categoria.id]) {
      const texto = textoONulo(clave);
      if (texto) diccionario.set(texto.toLowerCase(), entrada);
    }
  }
  return diccionario;
}

// Arma el directorio: pide las tiendas (con Bearer) y el diccionario de categorías (público) en paralelo. Si el
// diccionario falla, las tiendas se muestran igual, sin traducir, y se devuelve el motivo en `errorDiccionario`.
async function cargarDirectorioAdonis(token, signal) {
  const [crudas, categorias] = await Promise.all([
    cargarTiendasAdonis(token, signal),
    cargarCategoriasAdonis(signal).then(
      (diccionario) => ({ diccionario, error: "" }),
      (err) => {
        if (signal.aborted) throw err;
        console.error(err);
        return { diccionario: new Map(), error: err.message || "no se pudo leer el diccionario de categorías." };
      }
    ),
  ]);

  const vistos = new Set();
  const lista = crudas
    .map((t) => mapearTienda(t, categorias.diccionario))
    .filter((t) => t !== null && !vistos.has(String(t.id)) && vistos.add(String(t.id)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  // categoriasUnicas: cada categoría una sola vez (el diccionario la indexa por `code` y por `id`, con la misma entrada)
  return { lista, errorDiccionario: categorias.error, categoriasUnicas: [...new Set(categorias.diccionario.values())] };
}

// Opciones operativas del menú lateral cuando se está dentro de un comercio (MenuLateralComercio). Cada una enlaza a
// la vista real del portal de comercios, que NO se toca: dentro de ellas manda su propio SidebarTienda. «Configuración
// básica» es comercios/configuracion (dirección, responsable, teléfono, ubicación y nicho de la tienda). Una opción
// nueva es una entrada más aquí.
const OPCIONES_COMERCIO = [
  { id: "kardex", href: "/comercios/productos", etiqueta: "Kardex", icono: Boxes },
  { id: "mostrador", href: "/comercios/mostrador", etiqueta: "Mostrador", icono: MonitorPlay },
  { id: "reportes", href: "/reportes", etiqueta: "Reportes", icono: BarChart3 },
  { id: "configuracion", href: "/comercios/configuracion", etiqueta: "Configuración básica", icono: Settings },
  { id: "horarios", href: "/comercios/horario", etiqueta: "Horarios", icono: Clock },
  { id: "metodos-pago", href: "/comercios/metodos-pago", etiqueta: "Métodos de pago", icono: CreditCard },
];

// Los valores del formulario de información básica salen del comercio tal como está en la tabla
const formularioDe = (tienda) => ({ nombre: tienda.nombre, nicho: tienda.nicho, representante: tienda.representante, contacto: tienda.contacto });

// Menú lateral del entorno de un comercio: sustituye al menú general (SidebarTienda) mientras se está dentro de uno.
// Mismo aspecto que SidebarTienda a propósito, para que el cambio de contexto sea fluido; es un componente propio porque
// SidebarTienda lo comparten Kardex, Mostrador y el resto de vistas internas, que no se tocan. «Master de Tiendas» vuelve
// al directorio sin recargar la página.
function MenuLateralComercio({ comercio, onVolver, onCerrarSesion }) {
  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-white border-r border-slate-100 flex flex-col font-sans">
      <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-100 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-[#FE6712] text-white flex items-center justify-center font-black text-sm shrink-0">D&apos;</div>
        <span className="text-sm font-black text-slate-900 truncate">Portal de Aliados</span>
      </div>

      <div className="px-3 pt-4 space-y-3 shrink-0">
        <button
          type="button"
          onClick={onVolver}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-[#FE6712] transition"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" /> Master de Tiendas
        </button>
        <div className="px-3 py-2.5 rounded-xl border border-orange-200 bg-orange-50">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-[#FE6712]">
            <Store className="w-3 h-3 shrink-0" /> Comercio activo
          </p>
          <p className="mt-0.5 text-sm font-black text-slate-900 truncate" title={comercio.nombre}>{comercio.nombre}</p>
          <p className="text-[10px] text-slate-500">Tienda #{comercio.id}</p>
        </div>
      </div>

      <nav aria-label="Opciones del comercio" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {OPCIONES_COMERCIO.map(({ id, href, etiqueta, icono: Icono }) => (
          <Link
            key={id}
            href={href}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
          >
            <Icono className="w-4 h-4 shrink-0" /> {etiqueta}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-100 shrink-0">
        <button
          type="button"
          onClick={onCerrarSesion}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
        >
          <LogOut className="w-4 h-4 shrink-0" /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

// Contenido del entorno de un comercio dentro del Master: lo que antes abrían «Editar Información Básica» (nombre,
// nicho, representante y contacto), Suspender/Activar y la Ficha Gastronómica, ahora siempre a la vista. Todo local: ni
// guardar ni cambiar el estatus escriben en el servidor (el aviso lo dice).
function EntornoComercio({ comercio, formulario, onCambiarFormulario, onGuardar, onDescartar, onCambiarEstatus, avisoGuardado, tokenAdmin }) {
  const idBase = useId();
  const nombreValido = formulario.nombre.trim() !== "";
  const hayCambios =
    formulario.nombre !== comercio.nombre || formulario.nicho !== comercio.nicho ||
    formulario.representante !== comercio.representante || formulario.contacto !== comercio.contacto;
  const activo = comercio.estatus === "ACTIVO";
  const claseCampo = "w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]";
  const claseEtiqueta = "text-[10px] font-bold text-slate-500 block mb-1";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 text-left space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900">Información básica</h2>
          <p className="mt-1 text-[11px] text-slate-400">
            Datos del comercio en el directorio. Los cambios se aplican solo en esta vista: todavía no se envían a Adonis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border whitespace-nowrap ${
            activo ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"
          }`}>
            {activo ? "Activo" : "Suspendido"}
          </span>
          <button
            type="button"
            onClick={onCambiarEstatus}
            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[11px] font-bold hover:bg-slate-100 transition flex items-center gap-1"
          >
            <Power className="w-3.5 h-3.5" /> {activo ? "Suspender" : "Activar"}
          </button>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar();
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor={`${idBase}-nombre`} className={claseEtiqueta}>Nombre</label>
            <input
              id={`${idBase}-nombre`}
              type="text"
              value={formulario.nombre}
              onChange={(e) => onCambiarFormulario({ nombre: e.target.value })}
              aria-invalid={nombreValido ? undefined : true}
              aria-describedby={nombreValido ? undefined : `${idBase}-nombre-error`}
              className={`${claseCampo} ${nombreValido ? "" : "border-rose-300"}`}
            />
          </div>
          <div>
            <label htmlFor={`${idBase}-nicho`} className={claseEtiqueta}>Nicho</label>
            <select
              id={`${idBase}-nicho`}
              value={formulario.nicho}
              onChange={(e) => onCambiarFormulario({ nicho: e.target.value })}
              className={claseCampo}
            >
              {!NICHOS_FILTRO.includes(formulario.nicho) && <option value={formulario.nicho}>{formulario.nicho}</option>}
              {NICHOS_FILTRO.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${idBase}-representante`} className={claseEtiqueta}>Representante</label>
            <input
              id={`${idBase}-representante`}
              type="text"
              value={formulario.representante}
              onChange={(e) => onCambiarFormulario({ representante: e.target.value })}
              className={claseCampo}
            />
          </div>
          <div>
            <label htmlFor={`${idBase}-contacto`} className={claseEtiqueta}>Contacto</label>
            <input
              id={`${idBase}-contacto`}
              type="text"
              value={formulario.contacto}
              onChange={(e) => onCambiarFormulario({ contacto: e.target.value })}
              className={claseCampo}
            />
          </div>
        </div>
        {!nombreValido && (
          <p id={`${idBase}-nombre-error`} className="text-[11px] font-bold text-rose-600">El nombre no puede quedar vacío.</p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {avisoGuardado !== null && (
            <span role="status" className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] font-bold text-amber-800">
              Guardado en esta vista (API pendiente)
            </span>
          )}
          {hayCambios && (
            <button
              type="button"
              onClick={onDescartar}
              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[11px] font-bold hover:bg-slate-100 transition flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Descartar cambios
            </button>
          )}
          <button
            type="submit"
            disabled={!hayCambios || !nombreValido}
            className="px-3 py-1.5 bg-[#FE6712] hover:bg-[#ea580c] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" /> Guardar
          </button>
        </div>
      </form>

      {esGastronomia(comercio) && <ConfiguracionGastronomica token={tokenAdmin} storeId={comercio.id} />}
    </div>
  );
}

export default function MasterTiendasPage() {
  const router = useRouter();
  const { isAdmin, loading: cargandoAuth, logout, user } = useAuth();
  const tokenAdmin = user?.token;

  const [tiendas, setTiendas] = useState([]);
  const [cargandoTiendas, setCargandoTiendas] = useState(true);
  const [errorTiendas, setErrorTiendas] = useState("");
  const [errorCategorias, setErrorCategorias] = useState("");
  const [recargaTiendas, setRecargaTiendas] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("TODOS");
  const [filtroNicho, setFiltroNicho] = useState("TODOS");
  // Entorno de un comercio: id del comercio en cuyo contexto se está (null = directorio), formulario de su información
  // básica y marca de tiempo del último «guardado en esta vista» mientras su aviso siga visible
  const [comercioActivoId, setComercioActivoId] = useState(null);
  const [formEdicion, setFormEdicion] = useState({ nombre: "", nicho: "General", representante: "", contacto: "" });
  const [avisoGuardado, setAvisoGuardado] = useState(null);
  const tituloEntornoRef = useRef(null);
  const ultimoComercioRef = useRef(null);
  // Nueva Tienda: sección abierta o no, categorías del diccionario para elegir y tiendas «creadas» (simuladas) de esta sesión
  const [creando, setCreando] = useState(false);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
  const [tiendasCreadas, setTiendasCreadas] = useState([]);

  // Solo un administrador con token pide el directorio; sin token (sesión antigua) o sin rol no sale ninguna petición
  useEffect(() => {
    if (!isAdmin || !tokenAdmin) return undefined;
    const controller = new AbortController();
    cargarDirectorioAdonis(tokenAdmin, controller.signal)
      .then(({ lista, errorDiccionario, categoriasUnicas }) => {
        if (controller.signal.aborted) return;
        setTiendas(lista);
        setCategoriasDisponibles(categoriasUnicas);
        setErrorTiendas("");
        setErrorCategorias(errorDiccionario);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error(err);
        setErrorTiendas(err.message || "No se pudieron listar las tiendas.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoTiendas(false);
      });
    return () => controller.abort();
  }, [isAdmin, tokenAdmin, recargaTiendas]);

  // El aviso del guardado local desaparece solo; un nuevo guardado reinicia el conteo
  useEffect(() => {
    if (avisoGuardado === null) return undefined;
    const temporizador = setTimeout(() => setAvisoGuardado(null), AVISO_GUARDADO_MS);
    return () => clearTimeout(temporizador);
  }, [avisoGuardado]);

  // El comercio en cuyo entorno se está se deriva de la tabla (así refleja los cambios locales); si dejara de existir
  // (p. ej. al recargar el directorio), la página vuelve sola al directorio
  const comercioActivo = tiendas.find((t) => t.id === comercioActivoId) ?? null;
  const enContexto = comercioActivo !== null;

  // Foco: al entrar, en el título del entorno; al volver, en el nombre del comercio del que se salió
  useEffect(() => {
    if (enContexto) tituloEntornoRef.current?.focus({ preventScroll: true });
    else if (ultimoComercioRef.current !== null) document.getElementById(`comercio-${ultimoComercioRef.current}`)?.focus();
  }, [enContexto]);

  const handleReintentarTiendas = () => {
    setErrorTiendas("");
    setErrorCategorias("");
    setCargandoTiendas(true);
    setRecargaTiendas((n) => n + 1);
  };

  const handleCerrarSesionErp = () => {
    logout();
    router.replace("/login");
  };

  // «Entrar» en un comercio (clic en su nombre). Siembra la MISMA sesión real que usa el Portal de Comercios
  // (iac_store/ud_store, ver commerceServices.js) para que sus vistas abran con la identidad de la tienda — funcional
  // para navegar el portal, pero el token es de mentira: cualquier llamada real a Adonis que valide sesión devolverá
  // 401 hasta que exista un endpoint real de impersonación administrativa. El Kardex ya sabe esto: para leer la lista
  // de tiendas y el Excel usa el token del administrador y reconoce este formato, así que no hay que cambiarlo sin
  // cambiar también PREFIJO_TOKEN_IMPERSONADO en comercios/productos/page.jsx. A diferencia del antiguo «Entrar como
  // comercio», no navega: cambia el contexto de esta página al entorno del comercio.
  const handleEntrarComercio = (tienda) => {
    localStorage.setItem("iac_store", `impersonado-admin-${tienda.id}`);
    localStorage.setItem("ud_store", JSON.stringify({ id: tienda.id, entityId: tienda.id, name: tienda.nombre, nombre: tienda.nombre }));
    ultimoComercioRef.current = tienda.id;
    setFormEdicion(formularioDe(tienda));
    setAvisoGuardado(null);
    setCreando(false);
    setComercioActivoId(tienda.id);
    window.scrollTo(0, 0);
  };

  const handleSalirComercio = () => {
    setComercioActivoId(null);
    window.scrollTo(0, 0);
  };

  const handleCambiarEstatus = (id) => {
    setTiendas((prev) => prev.map((t) => (t.id === id ? { ...t, estatus: t.estatus === "ACTIVO" ? "SUSPENDIDO" : "ACTIVO" } : t)));
  };

  // El nombre es el único camino para entrar a un comercio: no se deja guardar vacío (la fila quedaría inalcanzable).
  // Representante y contacto vacíos vuelven al valor por defecto de la tabla.
  const handleGuardarEdicion = (id) => {
    const nombre = formEdicion.nombre.trim();
    if (!nombre) return;
    const guardado = {
      nombre,
      nicho: formEdicion.nicho,
      representante: formEdicion.representante.trim() || NO_REGISTRADO,
      contacto: formEdicion.contacto.trim() || NO_REGISTRADO,
    };
    setTiendas((prev) => prev.map((t) => (t.id === id ? { ...t, ...guardado } : t)));
    setFormEdicion(guardado);
    setAvisoGuardado(Date.now());
  };

  // Creación SIMULADA: la tienda se queda en el estado de esta página (la más reciente primero) con un id local
  // «SIM-n»; no entra en `tiendas` porque esa tabla es la del servidor. Al conectar el backend, esto se sustituye por
  // la recarga del directorio.
  const handleCrearTienda = (registro) => {
    setTiendasCreadas((prev) => [{ ...registro, id: `SIM-${prev.length + 1}` }, ...prev]);
  };

  if (cargandoAuth) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-sm p-8 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-base font-black text-slate-900">Acceso restringido</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            El Master de Tiendas solo está disponible para roles de Administración.
          </p>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FE6712] hover:underline pt-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  // Dentro de un comercio: menú lateral y contenido propios en lugar del directorio. El estado del directorio (búsqueda,
  // filtros, tiendas) vive en esta misma página, así que al volver se encuentra tal como se dejó.
  if (comercioActivo) {
    return (
      <div className="flex min-h-screen bg-white">
        <MenuLateralComercio comercio={comercioActivo} onVolver={handleSalirComercio} onCerrarSesion={handleCerrarSesionErp} />

        <div className="flex-1 min-h-screen bg-white text-slate-800 flex flex-col font-sans">
          <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center gap-3">
              <div className="min-w-0">
                <h1 ref={tituloEntornoRef} tabIndex={-1} className="text-sm font-black text-slate-900 truncate focus:outline-none">
                  {comercioActivo.nombre}
                </h1>
                <p className="text-[11px] text-slate-400 font-medium">Entorno del comercio · Tienda #{comercioActivo.id}</p>
              </div>
              <button
                type="button"
                onClick={handleSalirComercio}
                className="ml-auto shrink-0 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Volver al Master
              </button>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-4">
            <EntornoComercio
              comercio={comercioActivo}
              formulario={formEdicion}
              onCambiarFormulario={(cambios) => setFormEdicion((previo) => ({ ...previo, ...cambios }))}
              onGuardar={() => handleGuardarEdicion(comercioActivo.id)}
              onDescartar={() => setFormEdicion(formularioDe(comercioActivo))}
              onCambiarEstatus={() => handleCambiarEstatus(comercioActivo.id)}
              avisoGuardado={avisoGuardado}
              tokenAdmin={user?.token}
            />
          </main>
        </div>
      </div>
    );
  }

  // Sin token (sesión antigua de duna_user) no hay nada que pedir: no se queda cargando para siempre, avisa
  const sinTokenAdmin = !tokenAdmin;
  const mostrandoCarga = cargandoTiendas && !sinTokenAdmin;
  const avisoTiendas = sinTokenAdmin
    ? "No se pudo cargar el directorio de tiendas: no hay un token de administrador en la sesión; cierra sesión y vuelve a iniciarla."
    : errorTiendas
      ? `No se pudo cargar el directorio de tiendas: ${errorTiendas}`
      : errorCategorias
        ? `Las tiendas cargaron, pero no se pudieron traducir sus categorías (se muestran como «${SIN_CLASIFICAR}» y la Ficha Gastronómica no se activa sola): ${errorCategorias}`
        : "";

  // Opciones del filtro de nichos: las categorías reales de las tiendas cargadas (más el nicho puesto a mano o «Sin clasificar»)
  const opcionesNicho = [...new Set(tiendas.flatMap((t) => (t.nicho === t.categorias.join(", ") ? t.categorias : [...t.categorias, t.nicho])))]
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const tiendasFiltradas = tiendas.filter((t) => {
    const q = busqueda.trim().toLowerCase();
    const coincideTexto = !q || t.nombre.toLowerCase().includes(q) || t.representante.toLowerCase().includes(q) || String(t.id).includes(q);
    const coincideEstatus = filtroEstatus === "TODOS" || t.estatus === filtroEstatus;
    const coincideNicho = filtroNicho === "TODOS" || t.nicho === filtroNicho || t.categorias.includes(filtroNicho);
    return coincideTexto && coincideEstatus && coincideNicho;
  });

  // Códigos (slug) ya registrados en el directorio: el formulario de Nueva Tienda avisa si se repite uno
  const codigosExistentes = tiendas.map((t) => t.codigo).filter(Boolean);

  return (
    <div className="flex min-h-screen bg-white">
      <SidebarTienda onCerrarSesion={handleCerrarSesionErp} />

      <div className="flex-1 min-h-screen bg-white text-slate-800 flex flex-col font-sans">
        <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900">Master de Tiendas</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Directorio global de comercios</p>
            </div>
            <button
              type="button"
              onClick={() => setCreando(true)}
              aria-expanded={creando}
              aria-controls={creando ? ID_SECCION_NUEVA_TIENDA : undefined}
              className="ml-auto px-4 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Nueva Tienda
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-4">
          {avisoTiendas && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800 text-left">
              <span className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {avisoTiendas}
              </span>
              {!sinTokenAdmin && (
                <button
                  type="button"
                  onClick={handleReintentarTiendas}
                  className="shrink-0 px-3 py-1.5 bg-white border border-amber-200 text-amber-800 rounded-lg text-[11px] font-bold hover:bg-amber-100 transition flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reintentar
                </button>
              )}
            </div>
          )}

          {creando && (
            <FormularioNuevaTienda
              categorias={categoriasDisponibles}
              cargandoCategorias={mostrandoCarga}
              errorCategorias={errorCategorias || errorTiendas}
              onReintentarCategorias={handleReintentarTiendas}
              codigosExistentes={codigosExistentes}
              tiendasCreadas={tiendasCreadas}
              onCrear={handleCrearTienda}
              onCerrar={() => setCreando(false)}
            />
          )}

          <div className="flex flex-wrap items-center gap-3 text-left">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, representante o ID..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
            </div>
            <select
              value={filtroEstatus}
              onChange={(e) => setFiltroEstatus(e.target.value)}
              className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:outline-none focus:border-[#FE6712]"
            >
              <option value="TODOS">Todos los estatus</option>
              <option value="ACTIVO">Activo</option>
              <option value="SUSPENDIDO">Suspendido</option>
            </select>
            <select
              value={filtroNicho}
              onChange={(e) => setFiltroNicho(e.target.value)}
              className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:outline-none focus:border-[#FE6712]"
            >
              <option value="TODOS">Todos los nichos</option>
              {opcionesNicho.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Nombre del Comercio</th>
                  <th className="p-3">Nicho</th>
                  <th className="p-3">Representante</th>
                  <th className="p-3">Contacto</th>
                  <th className="p-3">Estatus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mostrandoCarga ? (
                  <tr>
                    <td colSpan="6" className="p-10 text-center text-xs">
                      <span role="status" className="inline-flex items-center gap-2 font-bold text-slate-500">
                        <Loader2 className="w-4 h-4 text-[#FE6712] animate-spin" /> Cargando tiendas...
                      </span>
                    </td>
                  </tr>
                ) : tiendasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-10 text-center text-xs text-slate-400">No se encontraron comercios que coincidan.</td>
                  </tr>
                ) : (
                  tiendasFiltradas.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-mono text-slate-500">#{t.id}</td>
                      <td className="p-3">
                        <button
                          type="button"
                          id={`comercio-${t.id}`}
                          onClick={() => handleEntrarComercio(t)}
                          title={`Entrar al entorno de ${t.nombre}`}
                          className="rounded text-left font-bold text-slate-800 underline decoration-slate-300 underline-offset-4 transition hover:text-[#FE6712] hover:decoration-[#FE6712] focus-visible:text-[#FE6712] focus-visible:decoration-[#FE6712] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6712]/40"
                        >
                          {t.nombre}
                        </button>
                      </td>
                      <td className="p-3 text-slate-600">{t.nicho}</td>
                      <td className="p-3 text-slate-600">{t.representante}</td>
                      <td className="p-3 text-slate-600 font-mono">{t.contacto}</td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border whitespace-nowrap ${
                          t.estatus === "ACTIVO"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}>
                          {t.estatus === "ACTIVO" ? "Activo" : "Suspendido"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">Mostrando {tiendasFiltradas.length} de {tiendas.length} comercios.</p>
        </main>
      </div>
    </div>
  );
}

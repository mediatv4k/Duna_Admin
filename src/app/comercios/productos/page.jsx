"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Boxes, Upload, Download, ArrowLeft, Search,
  Plus, Edit3, Trash2, X, Check, Camera,
  Snowflake, IceCream2, Cpu, Pill, Scale, Layers as LayersIcon,
  Cloud, FileJson, RefreshCw, Loader2, LogOut
} from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { useBusinessProfile } from "@/context/BusinessProfileContext";
import { obtenerTokenComercio, obtenerUsuarioComercio, cerrarSesionComercio, subirExcelBatchComercio, normalizarErroresBatch } from "@/lib/commerceServices";

const NICHOS = [
  "General",
  "Farmacia & Salud",
  "Tecnología & Hogar",
  "Gastronomía & Heladería",
  "Granel / Peso",
];

const IMAGEN_DEFECTO = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&q=80";

const ADONIS_BASE = "https://dev.carjos-marketplace.cloud";
const ADONIS_API_KEY = "bf8f1b64-6342-48c5-af05-501e4c15a6cb";

function encabezadosComercio(token) {
  return {
    apiKey: ADONIS_API_KEY,
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Llama a un endpoint autenticado del comercio (Authorization: Bearer <iac_store>) y valida la envoltura {code, data}
async function pedirJsonComercio(url, token, opciones = {}) {
  const res = await fetch(url, {
    ...opciones,
    headers: { ...encabezadosComercio(token), ...(opciones.headers || {}) },
  });
  let datos = null;
  try {
    datos = await res.json();
  } catch (e) {
    datos = null;
  }
  if (!res.ok || !datos || datos.code !== 1) {
    const errMsg = typeof datos?.message === "object"
      ? JSON.stringify(datos.message)
      : (datos?.message || `Adonis respondió HTTP ${res.status}`);
    throw new Error(errMsg);
  }
  return datos;
}

// PUT /product/:id con el token del comercio (iac_store). Envía solo el id y los campos que cambian
// (misma convención que la baja lógica); lo usa la edición rápida en la tabla.
async function actualizarProductoComercio(adonisId, cambios, token) {
  return pedirJsonComercio(`${ADONIS_BASE}/product/${adonisId}`, token, {
    method: "PUT",
    body: JSON.stringify({ id: adonisId, ...cambios }),
  });
}

// GET /store/:storeId/products/all: el arreglo plano vive en data.products.data,
// y la metadata de paginación en data.products.meta (misma convención que last_page del catálogo público).
async function cargarCatalogoComercio(storeId, token, signal) {
  const urlPagina = (pagina) => `${ADONIS_BASE}/store/${storeId}/products/all?page=${pagina}`;
  const primera = await pedirJsonComercio(urlPagina(1), token, { signal });
  let items = primera?.data?.products?.data || [];
  const ultimaPagina = Number(primera?.data?.products?.meta?.last_page) || 1;
  for (let p = 2; p <= ultimaPagina; p++) {
    const siguiente = await pedirJsonComercio(urlPagina(p), token, { signal });
    items = items.concat(siguiente?.data?.products?.data || []);
  }
  return items;
}

// Tasa oficial de la tienda: endpoint público (misma convención que el resto del ERP), solo requiere apiKey
async function cargarTasaComercio(storeId, signal) {
  const res = await fetch(`${ADONIS_BASE}/store/${storeId}/payment/info`, {
    headers: { apiKey: ADONIS_API_KEY, "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) return 0;
  const info = await res.json();
  return Number(info?.data?.store?.referenceRateValue) || 0;
}

function nombreCategoriaComercio(item) {
  return item.category?.name || (typeof item.category === "string" ? item.category : "") || item.internalCategory || "";
}

// Busca un valor probando varias grafías (camelCase, snake_case, MAYÚSCULAS) tanto en la raíz
// del producto de Adonis como dentro de su metadata: el origen (import Excel vs. formulario propio)
// no siempre usa la misma convención de nombres.
function leerCampoFlexible(item, meta, claves) {
  for (const clave of claves) {
    if (item[clave] !== undefined && item[clave] !== null && item[clave] !== "") return item[clave];
  }
  for (const clave of claves) {
    if (meta[clave] !== undefined && meta[clave] !== null && meta[clave] !== "") return meta[clave];
  }
  return undefined;
}

// Adonis no persiste de forma confiable ni metadata.variants (siempre vuelve vacío) ni un "description"
// inflado con datos extra (columna con longitud máxima, ej. 255): la ficha técnica de farmacia se
// guarda solo en el navegador, por tienda y por SKU, y nunca viaja dentro del payload a Adonis.
function claveFarmaciaLocal(storeId) {
  return `farma_metadata_${storeId}`;
}

function leerFichasFarmaciaLocal(storeId) {
  if (typeof window === "undefined" || !storeId) return {};
  try {
    return JSON.parse(localStorage.getItem(claveFarmaciaLocal(storeId)) || "{}");
  } catch (e) {
    return {};
  }
}

function guardarFichaFarmaciaLocal(storeId, sku, camposFarmacia) {
  if (typeof window === "undefined" || !storeId || !sku) return;
  const dict = leerFichasFarmaciaLocal(storeId);
  dict[String(sku).trim().toUpperCase()] = camposFarmacia;
  localStorage.setItem(claveFarmaciaLocal(storeId), JSON.stringify(dict));
}

function guardarFichasFarmaciaLocalMasivo(storeId, entradas) {
  if (typeof window === "undefined" || !storeId) return;
  const dict = leerFichasFarmaciaLocal(storeId);
  entradas.forEach(([sku, campos]) => {
    dict[String(sku).trim().toUpperCase()] = campos;
  });
  localStorage.setItem(claveFarmaciaLocal(storeId), JSON.stringify(dict));
}

// Esquema plano que consume la tabla y el formulario; reconstruye los campos extendidos desde metadata (lectura)
function mapearProductoComercio(item, idx, storeId) {
  const meta = item.metadata || {};
  const codigoProducto = String(item.code || item.codigo || item.sku || item.id || "").trim().toUpperCase();
  const fichaFarmacia = leerFichasFarmaciaLocal(storeId)[codigoProducto] || null;
  if (idx === 0) {
    console.log("--> ITEM CRUDO DESDE ADONIS:", item.codigo, item.metadata || item.meta || item);
    console.log("--> CLAVES EN RAÍZ DE ADONIS:", Object.keys(item));
  }
  return {
    id: item.id != null ? String(item.id) : String(item.code || item.sku || `tmp_${Date.now()}`),
    adonisId: item.id,
    code: String(item.code || item.codigo || item.sku || item.id || ""),
    barcode: meta.barcode || item.barcode || "",
    name: item.name || "Sin Nombre",
    categoria: nombreCategoriaComercio(item) || "General",
    subcategoria: meta.subcategoria || item.internal_category || item.internalCategory || "",
    marca: meta.marca || "",
    costo: Number(meta.costo) || 0,
    price: Number(meta.price?.basePrice ?? item.price) || 0,
    stock: Number(item.stock ?? 0),
    image: item.image || item.pictureUrl || IMAGEN_DEFECTO,
    status: item.status || "ACTIVE",
    outOfStock: Boolean(item.outOfStock),
    descripcion: String(meta.descripcion || item.description || "").slice(0, 250),
    nicho: meta.nicho || "General",
    principioActivo: fichaFarmacia?.principioActivo ?? leerCampoFlexible(item, meta, ["principio_activo", "PRINCIPIO_ACTIVO", "principioActivo"]) ?? "",
    concentracion: fichaFarmacia?.concentracion ?? leerCampoFlexible(item, meta, ["concentracion", "CONCENTRACION", "concentracionDosis"]) ?? "",
    presentacion: fichaFarmacia?.presentacion ?? leerCampoFlexible(item, meta, ["presentacion", "PRESENTACION"]) ?? "",
    laboratorio: fichaFarmacia?.laboratorio ?? leerCampoFlexible(item, meta, ["laboratorio", "LABORATORIO"]) ?? "",
    registroSanitario: fichaFarmacia?.registroSanitario ?? leerCampoFlexible(item, meta, ["registro_sanitario", "REGISTRO_SANITARIO", "registroSanitario"]) ?? "",
    condicionVenta: fichaFarmacia?.condicionVenta ?? leerCampoFlexible(item, meta, ["condicion_venta", "CONDICION_VENTA", "condicionVenta"]) ?? "Venta Libre",
    cadenaFrio: fichaFarmacia ? Boolean(fichaFarmacia.cadenaFrio) : parseBooleano(leerCampoFlexible(item, meta, ["cadena_frio", "CADENA_FRIO", "cadenaFrio"])),
    lote: fichaFarmacia?.lote ?? leerCampoFlexible(item, meta, ["lote", "LOTE"]) ?? "",
    fechaVencimiento: fichaFarmacia?.fechaVencimiento ?? leerCampoFlexible(item, meta, ["fecha_vencimiento", "FECHA_VENCIMIENTO", "fechaVencimiento"]) ?? "",
    modelo: meta.modelo || "",
    especificacionClave: meta.especificacionClave || "",
    voltaje: meta.voltaje || "110V",
    condicion: meta.condicion || "Nuevo",
    mesesGarantia: Number(meta.mesesGarantia) || 0,
    variantes: meta.variantes || [],
    areaDespacho: meta.areaDespacho || "Cocina",
    toppings: meta.toppings || [],
    unidadMedida: meta.unidadMedida || "kg",
    origen: "ADONIS_COMERCIO",
    // metadata tal cual la devolvió Adonis: la edición rápida de precio la reenvía completa (solo cambia
    // price) para no perder weight/volume/comandaDisplay/variants ni un promoPrice ya existente
    metadataCrudo: meta,
  };
}

// Agotado si Adonis lo marca outOfStock o si no quedan existencias
function estaAgotado(p) {
  if (p.outOfStock) return true;
  return (Number(p.stock) || 0) <= 0;
}

const FORM_INICIAL = {
  code: "",
  barcode: "",
  name: "",
  categoria: "General",
  subcategoria: "",
  marca: "",
  costo: "",
  price: "",
  stock: "",
  image: "",
  descripcion: "",
  nicho: "General",
  // Farmacia & Salud
  principioActivo: "",
  concentracion: "",
  presentacion: "",
  laboratorio: "",
  registroSanitario: "",
  condicionVenta: "Venta Libre",
  cadenaFrio: false,
  lote: "",
  fechaVencimiento: "",
  // Tecnología & Hogar
  modelo: "",
  especificacionClave: "",
  voltaje: "110V",
  condicion: "Nuevo",
  mesesGarantia: "",
  // Gastronomía & Heladería
  variantes: [],
  areaDespacho: "Cocina",
  toppings: [],
  // Granel / Peso
  unidadMedida: "kg",
};

function parseSabores(str) {
  if (!str) return [];
  return String(str)
    .split(",")
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const [nombre, stock] = par.split(":");
      return { nombre: (nombre || "").trim(), stock: Number(stock) || 0 };
    })
    .filter((v) => v.nombre);
}

function serializarSabores(variantes) {
  return (variantes || [])
    .filter((v) => v.nombre)
    .map((v) => `${v.nombre}:${Number(v.stock) || 0}`)
    .join(",");
}

function parseBooleano(val) {
  if (typeof val === "boolean") return val;
  const s = String(val || "").trim().toUpperCase();
  return s === "SI" || s === "SÍ" || s === "TRUE" || s === "1";
}

function serializarToppings(toppings) {
  return (toppings || [])
    .filter((t) => t.nombre)
    .map((t) => `${t.nombre}:${Number(t.precioExtra) || 0}`)
    .join(" | ");
}

// Lee TOPPINGS_MODIFICADORES tolerando "Nombre:Precio", "Nombre (+Precio)" o solo "Nombre"
function parseToppings(str) {
  if (!str) return [];
  return String(str)
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, idx) => {
      let m = s.match(/^(.+?)\s*\(\s*\+?\s*\$?\s*([\d.,]+)\s*\)\s*$/);
      if (m) {
        return { id: `top_${Date.now()}_${idx}`, nombre: m[1].trim(), precioExtra: parseFloat(m[2].replace(",", ".")) || 0 };
      }
      m = s.match(/^(.+?)\s*:\s*\$?\s*([\d.,]+)\s*$/);
      if (m) {
        return { id: `top_${Date.now()}_${idx}`, nombre: m[1].trim(), precioExtra: parseFloat(m[2].replace(",", ".")) || 0 };
      }
      return { id: `top_${Date.now()}_${idx}`, nombre: s, precioExtra: 0 };
    })
    .filter((t) => t.nombre);
}

// El preview del dryRun puede traer cada bloque (toCreate/toUpdate/toDelete) como arreglo o como conteo
function contarPreview(valor) {
  return Array.isArray(valor) ? valor.length : Number(valor) || 0;
}

// Lee un archivo Excel en el navegador y devuelve sus filas como objetos {COLUMNA: valor}
function leerFilasExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo Excel."));
    reader.readAsBinaryString(file);
  });
}

// El batch de Adonis descarta estas 9 columnas: se extraen del Excel para sincronizarlas aparte
function extraerCamposFarmaciaExcel(row) {
  return {
    principioActivo: row.PRINCIPIO_ACTIVO || "",
    concentracion: row.CONCENTRACION || "",
    presentacion: row.PRESENTACION || "",
    laboratorio: row.LABORATORIO || "",
    registroSanitario: row.REGISTRO_SANITARIO || "",
    condicionVenta: row.CONDICION_VENTA || "Venta Libre",
    cadenaFrio: parseBooleano(row.CADENA_FRIO),
    lote: row.LOTE || "",
    fechaVencimiento: row.FECHA_VENCIMIENTO || "",
  };
}

function tieneAlgunCampoFarmacia(campos) {
  return Boolean(
    campos.principioActivo || campos.concentracion || campos.presentacion ||
    campos.laboratorio || campos.registroSanitario || campos.lote ||
    campos.fechaVencimiento || campos.cadenaFrio
  );
}

// Vuelve a sincronizar los campos estándar de un producto ya existente en Adonis (PUT /product/:id).
// La ficha técnica de farmacia (camposFarmacia) ya NO viaja en este payload: Adonis no la persiste de
// forma confiable en ningún campo (ni metadata suelta, ni metadata.variants, ni description con tag:
// esta última rompía por el límite de longitud de esa columna). Solo vive en localStorage (ver
// guardarFichasFarmaciaLocalMasivo). Devuelve true/false en vez de lanzar: ningún rechazo individual
// de Adonis debe interrumpir el lote ni la interfaz.
async function sincronizarMetadataFarmacia(producto, camposFarmacia, token, esPrimero) {
  const payload = {
    id: producto.adonisId,
    name: producto.name,
    price: Number(producto.price) || 0,
    stock: Number(producto.stock) || 0,
    category: producto.categoria,
    status: producto.status || "ACTIVE",
    code: producto.code,
    image: producto.image,
    internal_category: producto.subcategoria || "",
    description: producto.descripcion || "",
    metadata: {
      barcode: producto.barcode || "",
      subcategoria: producto.subcategoria || "",
      marca: producto.marca || "",
      costo: Number(producto.costo) || 0,
      descripcion: producto.descripcion || "",
      nicho: producto.nicho || "General",
      modelo: producto.modelo || "",
      especificacionClave: producto.especificacionClave || "",
      voltaje: producto.voltaje || "110V",
      condicion: producto.condicion || "Nuevo",
      mesesGarantia: Number(producto.mesesGarantia) || 0,
      variantes: producto.variantes || [],
      areaDespacho: producto.areaDespacho || "Cocina",
      toppings: producto.toppings || [],
      unidadMedida: producto.unidadMedida || "kg",
      price: { basePrice: Number(producto.price) || 0, infoPrice: Number(producto.price) || 0, promoPrice: 0 },
    },
  };
  try {
    if (esPrimero) console.log("--> ENVIANDO A PUT:", producto.id, payload);
    const res = await pedirJsonComercio(`${ADONIS_BASE}/product/${producto.adonisId}`, token, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (esPrimero) console.log("--> DATA DEVUELTA POR PUT ADONIS:", JSON.stringify(res?.data || res));
    return true;
  } catch (err) {
    console.error(`No se pudo sincronizar el producto ${producto.code} con Adonis:`, err);
    return false;
  }
}

// Vista previa JSON (Marketplace Core v2 "clásico"): útil para inspeccionar el producto,
// pero NO es el payload que se envía a Adonis al guardar (ver handleGuardarProducto: root + metadata).
function buildMarketplaceProductPayload(producto) {
  const metadataVariants = [];

  if ((producto.variantes || []).length > 0) {
    metadataVariants.push({
      name: "Sabor / Presentación",
      code: "FLAVOR",
      selectType: "SINGLE",
      pricingRole: "BASE",
      min: 1,
      max: 1,
      items: producto.variantes.map((v, i) => ({
        code: `VAR_${i + 1}`,
        title: v.nombre,
        price: Number(producto.price) || 0,
        stock: Number(v.stock) || 0,
      })),
    });
  }

  if ((producto.toppings || []).length > 0) {
    metadataVariants.push({
      name: "Toppings y Agregados",
      code: "TOPPINGS",
      selectType: "MULTIPLE",
      pricingRole: "ADDON",
      min: 0,
      max: producto.toppings.length,
      items: producto.toppings.map((t, i) => ({
        code: `TOP_${t.id || i + 1}`,
        title: t.nombre,
        price: Number(t.precioExtra) || 0,
      })),
    });
  }

  return {
    id: producto.id,
    code: producto.code,
    name: producto.name,
    image: producto.image,
    description: producto.descripcion,
    category: producto.categoria,
    internalCategory: producto.subcategoria || "",
    purchaseType: "UNIT",
    version: 2,
    storeManageStock: true,
    stock: producto.stock,
    price: producto.price,
    metadata: {
      price: {
        basePrice: Number(producto.price) || 0,
        promoPrice: producto.precioPromo ? Number(producto.precioPromo) : null,
        infoPrice: Number(producto.price) || 0,
      },
      variants: metadataVariants,
      // Ficha técnica de farmacia: ya viene poblada en "producto" desde mapearProductoComercio
      // (localStorage por SKU); se exporta aquí solo como referencia, no se envía a Adonis.
      farmacia: {
        principioActivo: producto.principioActivo || "",
        concentracion: producto.concentracion || "",
        presentacion: producto.presentacion || "",
        laboratorio: producto.laboratorio || "",
        registroSanitario: producto.registroSanitario || "",
        condicionVenta: producto.condicionVenta || "Venta Libre",
        cadenaFrio: Boolean(producto.cadenaFrio),
        lote: producto.lote || "",
        fechaVencimiento: producto.fechaVencimiento || "",
      },
    },
  };
}

// Celda numérica editable en línea: guarda con Enter o al perder el foco, solo si el valor es válido
// y cambió. Escape cancela. Sin efectos: el borrador vive únicamente mientras la celda tiene el foco.
function CeldaEditable({ valor, onGuardar, prefijo = "", entero = false, deshabilitado = false, etiqueta, claseTexto = "text-slate-900" }) {
  const [borrador, setBorrador] = useState(null);
  const cancelado = useRef(false);
  const numeroActual = Number(valor) || 0;
  const mostrado = borrador ?? (entero ? String(numeroActual) : numeroActual.toFixed(2));

  const confirmar = () => {
    if (cancelado.current) {
      cancelado.current = false;
      setBorrador(null);
      return;
    }
    if (borrador === null) return;
    const numero = Number(String(borrador).trim().replace(",", "."));
    setBorrador(null);
    if (borrador.trim() === "" || !Number.isFinite(numero) || numero < 0) return;
    const nuevo = entero ? Math.trunc(numero) : Math.round(numero * 100) / 100;
    if (nuevo === numeroActual) return;
    onGuardar(nuevo);
  };

  return (
    <div className="flex items-center gap-0.5">
      {prefijo && <span className={`text-xs font-black ${claseTexto}`}>{prefijo}</span>}
      <input
        type="text"
        inputMode={entero ? "numeric" : "decimal"}
        value={mostrado}
        disabled={deshabilitado}
        aria-label={etiqueta}
        title="Enter o clic fuera para guardar · Esc para cancelar"
        onFocus={(e) => {
          // El borrador arranca con el mismo texto que ya se ve ("10.00"): si cambiara, React reescribiría
          // el valor del input y se perdería la selección, y lo que se teclea se añadiría al final.
          setBorrador(mostrado);
          e.target.select();
        }}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelado.current = true;
            e.currentTarget.blur();
          }
        }}
        className={`${entero ? "w-16" : "w-20"} px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-[#FE6712] focus:outline-none bg-transparent focus:bg-white text-xs font-black disabled:opacity-60 ${claseTexto}`}
      />
    </div>
  );
}

export default function ComerciosProductosPage() {
  const router = useRouter();
  const { modoMoneda, tasaBcv } = useCurrency();
  const { perfil } = useBusinessProfile();
  const esPerfilSimple = perfil === "SIMPLE";

  // Guardia de sesión del portal de comercios: exige un token válido en localStorage ("iac_store")
  const [token, setToken] = useState(null);
  const [comercio, setComercio] = useState(null);
  const [verificandoSesion, setVerificandoSesion] = useState(true);

  useEffect(() => {
    const t = obtenerTokenComercio();
    if (!t) {
      router.replace("/comercios/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
    setToken(t);
    setComercio(obtenerUsuarioComercio());
    setVerificandoSesion(false);
  }, [router]);

  const storeId = comercio?.entityId || comercio?.storeId || comercio?.store?.id || comercio?.comercio_id || comercio?.id || null;

  const handleCerrarSesion = () => {
    cerrarSesionComercio();
    router.replace("/comercios/login");
  };

  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [borrarNoIncluidos, setBorrarNoIncluidos] = useState(false);
  const [simular, setSimular] = useState(false);
  const [reporteImportacion, setReporteImportacion] = useState(null);
  const [estadoFilas, setEstadoFilas] = useState({});
  const [errorEdicionRapida, setErrorEdicionRapida] = useState("");
  const temporizadoresFilas = useRef({});
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [tasaAdonis, setTasaAdonis] = useState(0);
  const [recarga, setRecarga] = useState(0);
  const tasa = tasaAdonis || tasaBcv || 0;
  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoEnEdicion, setProductoEnEdicion] = useState(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const [formData, setFormData] = useState(FORM_INICIAL);
  const [nuevoTopping, setNuevoTopping] = useState({ nombre: "", precioExtra: "" });
  const [modalJsonAbierto, setModalJsonAbierto] = useState(false);
  const [productoJsonActual, setProductoJsonActual] = useState(null);

  // Carga en vivo desde AdonisJS (catálogo autenticado del comercio + tasa oficial de su tienda)
  useEffect(() => {
    if (!token || !storeId) return undefined;
    const controller = new AbortController();
    Promise.allSettled([cargarCatalogoComercio(storeId, token, controller.signal), cargarTasaComercio(storeId, controller.signal)])
      .then(([catalogo, tasaResp]) => {
        if (controller.signal.aborted) return;
        if (catalogo.status === "fulfilled") {
          setProductos(catalogo.value.map((item, idx) => mapearProductoComercio(item, idx, storeId)));
          setError("");
        } else {
          console.error(catalogo.reason);
          setError("No se pudo cargar el catálogo desde Adonis. Verifica tu conexión e intenta de nuevo.");
        }
        if (tasaResp.status === "fulfilled") setTasaAdonis(tasaResp.value);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });
    return () => controller.abort();
  }, [token, storeId, recarga]);

  // Altas/ediciones ya persisten directamente en Adonis (ver handleGuardarProducto); esto solo
  // sincroniza el estado local, por ejemplo tras una importación de Excel.
  const actualizarProductos = (nuevos) => {
    setProductos(nuevos);
  };

  // Vuelve a consultar Adonis (catálogo + tasa) y refresca la tabla
  const handleSincronizarAdonis = () => {
    setCargando(true);
    setRecarga((n) => n + 1);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!token || !storeId) {
      setReporteImportacion({ tipo: "error", archivo: file.name, mensaje: "Tu sesión expiró o no tiene una tienda asociada. Vuelve a iniciar sesión.", errores: [] });
      if (fileInputRef.current) fileInputRef.current.value = null;
      return;
    }

    setReporteImportacion(null);
    setCargando(true);
    try {
      const respuesta = await subirExcelBatchComercio(storeId, file, token, borrarNoIncluidos, { dryRun: simular });
      const errores = normalizarErroresBatch(respuesta?.errors ?? respuesta?.data?.errors);

      // Simulación: el backend solo valida y devuelve el preview. Se aborta todo efecto secundario:
      // sin refetch del catálogo, sin PUT de sincronización y sin persistir fichas de farmacia en localStorage.
      if (simular) {
        const preview = respuesta?.preview ?? respuesta?.data?.preview ?? {};
        setReporteImportacion({
          tipo: "simulacion",
          archivo: file.name,
          resumen: [
            { etiqueta: "Por crear", valor: contarPreview(preview.toCreate) },
            { etiqueta: "Por actualizar", valor: contarPreview(preview.toUpdate) },
            { etiqueta: "Por eliminar", valor: contarPreview(preview.toDelete) },
            { etiqueta: "Con error", valor: errores.length },
          ],
          errores,
        });
        return;
      }

      const stats = respuesta?.data || {};

      // El batch descarta las columnas de farmacia y Adonis no las persiste de forma confiable en
      // ningún campo del producto: la ficha técnica se guarda solo en este navegador, por SKU.
      const catalogoActualizado = (await cargarCatalogoComercio(storeId, token)).map((item, idx) => mapearProductoComercio(item, idx, storeId));
      setProductos(catalogoActualizado);

      const filasExcel = await leerFilasExcel(file);
      const porCodigo = new Map(catalogoActualizado.map((p) => [String(p.code || "").trim().toUpperCase(), p]));

      const entradasFarmacia = [];
      for (const row of filasExcel) {
        const codigo = String(row.CODIGO || "").trim().toUpperCase();
        if (!codigo) continue;
        const camposFarmacia = extraerCamposFarmaciaExcel(row);
        if (tieneAlgunCampoFarmacia(camposFarmacia)) entradasFarmacia.push([codigo, camposFarmacia]);
      }
      guardarFichasFarmaciaLocalMasivo(storeId, entradasFarmacia);

      let sincronizados = 0;
      for (const [codigo, camposFarmacia] of entradasFarmacia) {
        const producto = porCodigo.get(codigo);
        if (!producto || !producto.adonisId) continue;
        const ok = await sincronizarMetadataFarmacia(producto, camposFarmacia, token, sincronizados === 0);
        if (ok) sincronizados++;
      }

      // Refleja de inmediato en la tabla las fichas técnicas recién guardadas en localStorage,
      // sin pedir la red de nuevo ni tocar el resto de los campos ya cargados del producto.
      if (entradasFarmacia.length > 0) {
        const dictLocal = leerFichasFarmaciaLocal(storeId);
        setProductos((prev) => prev.map((p) => {
          const ficha = dictLocal[String(p.code || "").trim().toUpperCase()];
          return ficha ? { ...p, ...ficha } : p;
        }));
      }

      const creados = Number(stats.created) || 0;
      const actualizados = Number(stats.updated) || 0;
      setReporteImportacion({
        tipo: "real",
        archivo: file.name,
        resumen: [
          { etiqueta: "Procesados", valor: Number(stats.processed ?? stats.total) || (creados + actualizados) },
          { etiqueta: "Creados", valor: creados },
          { etiqueta: "Actualizados", valor: actualizados },
          { etiqueta: "Eliminados", valor: Number(stats.deleted) || 0 },
          { etiqueta: "Con error", valor: errores.length },
          { etiqueta: "Fichas de farmacia (local)", valor: entradasFarmacia.length },
        ],
        errores,
      });
    } catch (err) {
      setReporteImportacion({ tipo: "error", archivo: file.name, mensaje: err.message || "Error al subir el archivo Excel.", errores: err.errores || [] });
    } finally {
      setCargando(false);
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  };

  const handleExportExcel = () => {
    const dataToExport = productos.length > 0 ? productos.map(p => ({
      CODIGO: p.code,
      CATEGORIA: p.categoria,
      "Categoría Interna": p.subcategoria || "",
      NOMBRE: p.name,
      DESCRIPCION: p.descripcion || "",
      CANTIDAD: p.stock,
      MINIMO: p.minimo || 1,
      MAXIMO: p.maximo || 0,
      IMAGEN: p.image,
      STATUS: p.status || "ACTIVE",
      "PRECIO BASE": p.price,
      "PRECIO INFO": p.precioInfo || p.price,
      "PRECIO PROMO": p.precioPromo || 0,
      "LABEL PROMO": p.labelPromo || "",
      "NOTA PROMO": p.notaPromo || "",
      ORDEN: p.orden || 0,
      PESO: p.peso || 0,
      VOLUMEN: p.volumen || 0,
      NICHO: p.nicho || "General",
      COSTO: p.costo || 0,
      BARCODE: p.barcode || "",
      MARCA: p.marca || "",
      PRINCIPIO_ACTIVO: p.principioActivo || "",
      CONCENTRACION: p.concentracion || "",
      PRESENTACION: p.presentacion || "",
      LABORATORIO: p.laboratorio || "",
      REGISTRO_SANITARIO: p.registroSanitario || "",
      CONDICION_VENTA: p.condicionVenta || "",
      CADENA_FRIO: p.cadenaFrio ? "SI" : "NO",
      LOTE: p.lote || "",
      FECHA_VENCIMIENTO: p.fechaVencimiento || "",
      MODELO: p.modelo || "",
      ESPECIFICACION_CLAVE: p.especificacionClave || "",
      VOLTAJE: p.voltaje || "",
      CONDICION: p.condicion || "",
      MESES_GARANTIA: p.mesesGarantia || 0,
      SABORES: serializarSabores(p.variantes),
      AREA_DESPACHO: p.areaDespacho || "",
      TOPPINGS_MODIFICADORES: serializarToppings(p.toppings),
      UNIDAD_MEDIDA: p.unidadMedida || "",
    })) : [
      {
        CODIGO: "P001",
        CATEGORIA: "General",
        "Categoría Interna": "",
        NOMBRE: "Producto Ejemplo",
        DESCRIPCION: "Descripción oficial de 250 caracteres",
        CANTIDAD: 20,
        MINIMO: 1,
        MAXIMO: 0,
        IMAGEN: "",
        STATUS: "ACTIVE",
        "PRECIO BASE": 5.00,
        "PRECIO INFO": 5.00,
        "PRECIO PROMO": 0,
        "LABEL PROMO": "",
        "NOTA PROMO": "",
        ORDEN: 0,
        PESO: 0,
        VOLUMEN: 0,
        NICHO: "General",
        COSTO: 0,
        BARCODE: "",
        MARCA: "",
        PRINCIPIO_ACTIVO: "",
        CONCENTRACION: "",
        PRESENTACION: "",
        LABORATORIO: "",
        REGISTRO_SANITARIO: "",
        CONDICION_VENTA: "",
        CADENA_FRIO: "NO",
        LOTE: "",
        FECHA_VENCIMIENTO: "",
        MODELO: "",
        ESPECIFICACION_CLAVE: "",
        VOLTAJE: "",
        CONDICION: "",
        MESES_GARANTIA: 0,
        SABORES: "",
        AREA_DESPACHO: "",
        TOPPINGS_MODIFICADORES: "",
        UNIDAD_MEDIDA: "",
      }
    ];

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "Productos_Comercio.xlsx");
  };

  const handleExportMarketplace = () => {
    const payload = productos.map(buildMarketplaceProductPayload);
    const fecha = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalogo_marketplace_v2_${fecha}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const abrirModalJson = (item) => {
    setProductoJsonActual(item);
    setModalJsonAbierto(true);
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Recomendamos fotos menores a 2MB.");
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const abrirModalNuevo = () => {
    setProductoEnEdicion(null);
    setFormData({
      ...FORM_INICIAL,
      code: `P00${productos.length + 1}`,
    });
    setNuevoTopping({ nombre: "", precioExtra: "" });
    setModalAbierto(true);
  };

  const abrirModalEditar = (prod) => {
    const precioReal = prod?.metadata?.price?.basePrice ?? prod?.price ?? 0;
    setProductoEnEdicion(prod);
    setFormData({
      ...FORM_INICIAL,
      ...prod,
      price: precioReal,
      variantes: prod.variantes || [],
      toppings: prod.toppings || [],
    });
    setNuevoTopping({ nombre: "", precioExtra: "" });
    setModalAbierto(true);
  };

  const totalVariantesStock = formData.variantes.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
  const esGastronomia = formData.nicho === "Gastronomía & Heladería";
  const costoNum = Number(formData.costo) || 0;
  const priceNum = Number(formData.price) || 0;
  const margenBruto = priceNum > 0 ? ((priceNum - costoNum) / priceNum) * 100 : 0;
  const ganancia = priceNum - costoNum;

  const handleAgregarVariante = () => {
    setFormData(prev => ({ ...prev, variantes: [...prev.variantes, { nombre: "", stock: 0 }] }));
  };

  const handleCambiarVariante = (idx, campo, valor) => {
    setFormData(prev => ({
      ...prev,
      variantes: prev.variantes.map((v, i) => i === idx ? { ...v, [campo]: valor } : v)
    }));
  };

  const handleEliminarVariante = (idx) => {
    setFormData(prev => ({ ...prev, variantes: prev.variantes.filter((_, i) => i !== idx) }));
  };

  const mostrarToppings = formData.nicho === "Gastronomía & Heladería" || formData.nicho === "General";

  const handleAgregarTopping = () => {
    if (!nuevoTopping.nombre.trim()) return;
    setFormData(prev => ({
      ...prev,
      toppings: [...prev.toppings, {
        id: `top_${Date.now()}`,
        nombre: nuevoTopping.nombre.trim(),
        precioExtra: Number(nuevoTopping.precioExtra) || 0,
      }],
    }));
    setNuevoTopping({ nombre: "", precioExtra: "" });
  };

  const handleEliminarTopping = (id) => {
    setFormData(prev => ({ ...prev, toppings: prev.toppings.filter(t => t.id !== id) }));
  };

  // Túnel de datos hacia Adonis: separa los campos básicos (raíz) de los extendidos (metadata) y
  // hace POST /product (alta) o PUT /product/:id (edición) con el token del comercio.
  const handleGuardarProducto = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.price) {
      alert("Indica nombre y precio.");
      return;
    }
    if (!token || !storeId) {
      alert("Tu sesión expiró o no tiene una tienda asociada. Vuelve a iniciar sesión.");
      return;
    }

    const imagenFinal = formData.image.trim() || IMAGEN_DEFECTO;
    const stockFinal = esGastronomia ? totalVariantesStock : (Number(formData.stock) || 0);

    // Adonis no persiste la ficha técnica de farmacia de forma confiable (ni metadata suelta, ni
    // metadata.variants, ni description con tag: rompe el límite de longitud de esa columna). Se
    // guarda solo en localStorage, por tienda y por SKU (ver guardarFichaFarmaciaLocal).
    const camposFarmaciaForm = {
      principioActivo: formData.principioActivo,
      concentracion: formData.concentracion,
      presentacion: formData.presentacion,
      laboratorio: formData.laboratorio,
      registroSanitario: formData.registroSanitario,
      condicionVenta: formData.condicionVenta,
      cadenaFrio: formData.cadenaFrio,
      lote: formData.lote,
      fechaVencimiento: formData.fechaVencimiento,
    };
    guardarFichaFarmaciaLocal(storeId, formData.code, camposFarmaciaForm);

    // Campos básicos que AdonisJS espera en la raíz del producto
    const raiz = {
      name: formData.name,
      price: Number(formData.price) || 0,
      stock: stockFinal,
      category: formData.categoria,
      status: "ACTIVE",
      code: formData.code,
      image: imagenFinal,
      description: formData.descripcion || "",
    };

    // Campos avanzados/personalizados que Adonis no soporta nativamente: viajan agrupados en "metadata"
    const metadata = {
      barcode: formData.barcode,
      subcategoria: formData.subcategoria,
      marca: formData.marca,
      costo: Number(formData.costo) || 0,
      descripcion: formData.descripcion.slice(0, 250),
      nicho: formData.nicho,
      principioActivo: formData.principioActivo,
      concentracion: formData.concentracion,
      presentacion: formData.presentacion,
      laboratorio: formData.laboratorio,
      registroSanitario: formData.registroSanitario,
      condicionVenta: formData.condicionVenta,
      cadenaFrio: formData.cadenaFrio,
      lote: formData.lote,
      fechaVencimiento: formData.fechaVencimiento,
      modelo: formData.modelo,
      especificacionClave: formData.especificacionClave,
      voltaje: formData.voltaje,
      condicion: formData.condicion,
      mesesGarantia: Number(formData.mesesGarantia) || 0,
      variantes: esGastronomia ? formData.variantes.filter(v => v.nombre) : [],
      areaDespacho: formData.areaDespacho,
      toppings: mostrarToppings ? formData.toppings.filter(t => t.nombre) : [],
      unidadMedida: formData.unidadMedida,
    };

    // Esquema V2: el core de Adonis lee el precio desde metadata.price.basePrice, no de la raíz
    metadata.price = {
      basePrice: Number(formData.price) || 0,
      infoPrice: Number(formData.price) || 0,
      promoPrice: Number(formData.promoPrice) || 0,
    };


    const payload = { ...raiz, metadata };
    // El backend exige la subcategoría bajo esta clave en snake_case en la raíz del payload
    payload.internal_category = formData.subcategoria || formData.subcategory || formData.internal_category || "";
    // INYECCIÓN CRÍTICA: al editar, viaja el id real de Adonis en el payload para que el backend lo trate como actualización
    if (productoEnEdicion?.adonisId) {
      payload.id = productoEnEdicion.adonisId;
    }
    const esEdicion = Boolean(productoEnEdicion?.adonisId);
    const url = esEdicion ? `${ADONIS_BASE}/product/${productoEnEdicion.adonisId}` : `${ADONIS_BASE}/product`;

    setGuardando(true);
    try {
      await pedirJsonComercio(url, token, {
        method: esEdicion ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setModalAbierto(false);
      // Adonis es la única fuente de verdad: se refresca el catálogo real tras guardar
      setRecarga((n) => n + 1);
    } catch (err) {
      alert(err.message || "No se pudo guardar el producto en Adonis.");
    } finally {
      setGuardando(false);
    }
  };

  // Baja lógica: no existe endpoint DELETE (se protege el historial contable). Se marca status: "INACTIVE"
  // vía PUT /product/:id y se refresca desde Adonis, que sigue siendo la única fuente de verdad.
  const handleEliminarProducto = async (producto) => {
    if (!confirm(`¿Desactivar "${producto.name}"? Dejará de mostrarse en el catálogo.`)) return;
    if (!token || !producto.adonisId) {
      alert("No se puede desactivar: falta el identificador de Adonis para este producto.");
      return;
    }
    try {
      await pedirJsonComercio(`${ADONIS_BASE}/product/${producto.adonisId}`, token, {
        method: "PUT",
        body: JSON.stringify({ id: producto.adonisId, status: "INACTIVE" }),
      });
      // Quita la fila de inmediato del estado local: no espera a un refetch por si Adonis
      // sigue devolviendo productos INACTIVE en /products/all
      setProductos(prev => prev.filter(p => p.id !== producto.id));
    } catch (err) {
      alert(err.message || "No se pudo desactivar el producto en Adonis.");
    }
  };

  // Micro-indicador por fila: "guardando" (spinner), "ok" (check verde ~2 s) o "error" (queda hasta el próximo cambio)
  const marcarFila = (id, fase, mensaje = "") => {
    clearTimeout(temporizadoresFilas.current[id]);
    setEstadoFilas((prev) => ({ ...prev, [id]: { fase, mensaje } }));
    if (fase === "ok") {
      temporizadoresFilas.current[id] = setTimeout(() => {
        setEstadoFilas((prev) => {
          const copia = { ...prev };
          delete copia[id];
          return copia;
        });
      }, 2000);
    }
  };

  // Edición rápida en tabla: actualización optimista del estado local y PUT /product/:id solo con el id y
  // los campos que cambian. Si Adonis rechaza, se revierte la fila y se avisa en la fila y en el banner.
  const guardarCambioRapido = async (producto, cambiosLocales, cambiosPayload) => {
    if (!token || !producto.adonisId) {
      setErrorEdicionRapida("No se puede guardar: falta el identificador de Adonis para este producto.");
      return;
    }
    const previo = {};
    Object.keys(cambiosLocales).forEach((campo) => { previo[campo] = producto[campo]; });
    setErrorEdicionRapida("");
    setProductos((prev) => prev.map((p) => (p.id === producto.id ? { ...p, ...cambiosLocales } : p)));
    marcarFila(producto.id, "guardando");
    try {
      await actualizarProductoComercio(producto.adonisId, cambiosPayload, token);
      marcarFila(producto.id, "ok");
    } catch (err) {
      setProductos((prev) => prev.map((p) => (p.id === producto.id ? { ...p, ...previo } : p)));
      const mensaje = err.message || "Adonis rechazó el cambio.";
      marcarFila(producto.id, "error", mensaje);
      setErrorEdicionRapida(`No se pudo guardar «${producto.name}»: ${mensaje}`);
    }
  };

  const handleToggleEstado = (producto) => {
    const nuevo = producto.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
    guardarCambioRapido(producto, { status: nuevo }, { status: nuevo });
  };

  const handleEditarStock = (producto, nuevo) => {
    guardarCambioRapido(producto, { stock: nuevo }, { stock: nuevo });
  };

  // El precio V2 vive en metadata.price.basePrice (la raíz es solo el respaldo V1): se reenvía la metadata
  // completa que trajo Adonis cambiando únicamente price, para no perder el resto de sus claves.
  const handleEditarPrecio = (producto, nuevo) => {
    const metaPrevia = producto.metadataCrudo || {};
    const precioPrevio = metaPrevia.price || {};
    const precioMeta = { ...precioPrevio, basePrice: nuevo };
    if (precioPrevio.infoPrice == null || Number(precioPrevio.infoPrice) === Number(precioPrevio.basePrice)) {
      precioMeta.infoPrice = nuevo;
    }
    const metadata = { ...metaPrevia, price: precioMeta };
    guardarCambioRapido(producto, { price: nuevo, metadataCrudo: metadata }, { price: nuevo, metadata });
  };

  const categoriasDisponibles = [...new Set(productos.map(p => p.categoria).filter(Boolean))].sort();

  const productosFiltrados = productos.filter(p => {
    const q = busqueda.trim().toLowerCase();
    const coincideBusqueda = !q ||
      (p.name || "").toLowerCase().includes(q) ||
      (p.categoria || "").toLowerCase().includes(q) ||
      (p.code || "").toLowerCase().includes(q);
    const coincideCategoria = filtroCategoria === "TODAS" || p.categoria === filtroCategoria;
    return coincideBusqueda && coincideCategoria;
  });

  if (verificandoSesion) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
      </div>
    );
  }

  if (!storeId) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full text-center space-y-3">
          <h1 className="text-sm font-black text-slate-900">Cuenta sin tienda asociada</h1>
          <p className="text-xs text-slate-500">Tu usuario no tiene un storeId asignado en Adonis. Contacta al equipo de D&apos;una para vincular tu comercio.</p>
          <button
            type="button"
            onClick={handleCerrarSesion}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col font-sans">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCerrarSesion}
              title="Cerrar sesión"
              className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition border border-slate-200"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900">Portal de Aliados Comerciales</span>
                <span className="text-[11px] bg-orange-50 text-[#FE6712] px-2.5 py-0.5 rounded-full font-bold border border-orange-200">PRODUCTOS</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {comercio?.name || comercio?.nombre || "Comercio"} · Tienda #{storeId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSincronizarAdonis}
              disabled={cargando}
              title="Sincronizar con Adonis"
              aria-label="Sincronizar con Adonis"
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${cargando ? "animate-spin" : ""}`} />
              <span className="sr-only">{cargando ? "Actualizando..." : "Sincronizar con Adonis"}</span>
            </button>
            <button
              onClick={abrirModalNuevo}
              title="Nuevo Producto"
              aria-label="Nuevo Producto"
              className="px-3.5 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden xl:inline whitespace-nowrap">Nuevo Producto</span>
            </button>
            <label className="flex items-center gap-2 px-3 py-2 bg-white rounded-2xl border border-slate-200 cursor-pointer shadow-sm hover:bg-slate-50 transition" title="Si está activo, eliminará los productos que no estén en el Excel">
              <div className={`w-8 h-5 shrink-0 rounded-full relative transition-colors ${borrarNoIncluidos ? 'bg-[#FE6712]' : 'bg-slate-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm absolute top-[2px] transition-all ${borrarNoIncluidos ? 'left-[14px]' : 'left-[2px]'}`} />
              </div>
              <input type="checkbox" checked={borrarNoIncluidos} onChange={(e) => setBorrarNoIncluidos(e.target.checked)} className="hidden" />
              <span className="text-xs font-bold text-slate-600 hidden 2xl:inline whitespace-nowrap">Borrar no incluidos</span>
            </label>
            <label className="flex items-center gap-2 px-3 py-2 bg-white rounded-2xl border border-slate-200 cursor-pointer shadow-sm hover:bg-slate-50 transition" title="Si está activo, el Excel solo se valida en el servidor y no se guarda ningún cambio">
              <div className={`w-8 h-5 shrink-0 rounded-full relative transition-colors ${simular ? 'bg-[#FE6712]' : 'bg-slate-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm absolute top-[2px] transition-all ${simular ? 'left-[14px]' : 'left-[2px]'}`} />
              </div>
              <input type="checkbox" checked={simular} onChange={(e) => setSimular(e.target.checked)} className="hidden" />
              <span className="text-xs font-bold text-slate-600 hidden 2xl:inline whitespace-nowrap">Simular (sin guardar)</span>
            </label>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Importar Excel"
              aria-label="Importar Excel"
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <Upload className="w-4 h-4 text-[#FE6712]" />
              <span className="hidden xl:inline whitespace-nowrap">Importar Excel</span>
            </button>
            <button
              onClick={handleExportExcel}
              title="Exportar Excel"
              aria-label="Exportar Excel"
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span className="sr-only">Exportar Excel</span>
            </button>
            <button
              onClick={handleExportMarketplace}
              title="Exportar Marketplace (JSON v2)"
              aria-label="Exportar Marketplace (JSON v2)"
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <Cloud className="w-4 h-4 text-slate-500" />
              <span className="sr-only">Exportar Marketplace (JSON v2)</span>
            </button>
            <button
              onClick={handleCerrarSesion}
              title="Salir"
              aria-label="Salir"
              className="px-3 py-2 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="sr-only">Salir</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por código, nombre o categoría..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
            />
          </div>
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="w-full sm:w-56 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
            aria-label="Filtrar por categoría"
          >
            <option value="TODAS">Todas las categorías</option>
            {categoriasDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="text-xs text-slate-500 font-medium sm:ml-auto">
            Artículos cargados: <strong className="text-slate-900 font-bold">{productos.length}</strong>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            {error}
          </div>
        )}

        {errorEdicionRapida && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            <span>{errorEdicionRapida}</span>
            <button type="button" onClick={() => setErrorEdicionRapida("")} aria-label="Cerrar aviso" className="shrink-0 text-rose-500 hover:text-rose-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {reporteImportacion && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  {reporteImportacion.tipo === "simulacion" && "Simulación completada: no se guardó ningún cambio"}
                  {reporteImportacion.tipo === "real" && "Importación completada"}
                  {reporteImportacion.tipo === "error" && "No se pudo procesar el archivo"}
                </h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {reporteImportacion.archivo}
                  {reporteImportacion.tipo === "simulacion" && " · Nada se guardó en Adonis ni en este navegador."}
                  {reporteImportacion.tipo === "real" && " · Catálogo y fichas técnicas de farmacia sincronizados."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReporteImportacion(null)}
                aria-label="Cerrar reporte de importación"
                className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 transition shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reporteImportacion.mensaje && (
              <p className="px-4 pt-3 text-xs font-bold text-rose-700">{reporteImportacion.mensaje}</p>
            )}

            {reporteImportacion.resumen && (
              <div className="flex flex-wrap gap-2 px-4 py-3">
                {reporteImportacion.resumen.map((r) => (
                  <div key={r.etiqueta} className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-500 font-medium">
                    {r.etiqueta}: <strong className={`font-black ${r.etiqueta === "Con error" && r.valor > 0 ? "text-rose-600" : "text-slate-900"}`}>{r.valor}</strong>
                  </div>
                ))}
              </div>
            )}

            {reporteImportacion.errores.length > 0 ? (
              <div className="px-4 pb-4">
                <p className="text-[11px] font-bold text-slate-600 mb-2">
                  Filas omitidas o con error ({reporteImportacion.errores.length})
                </p>
                <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 font-bold w-40">Producto / SKU</th>
                        <th className="px-3 py-2 font-bold">Mensaje</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reporteImportacion.errores.map((er, i) => (
                        <tr key={`${er.referencia}-${i}`}>
                          <td className="px-3 py-2 font-bold text-slate-800 align-top">{er.referencia}</td>
                          <td className="px-3 py-2 text-slate-600 break-words">{er.mensaje}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              reporteImportacion.tipo !== "error" && (
                <p className="px-4 pb-4 text-[11px] font-bold text-emerald-600">Sin filas omitidas ni con error.</p>
              )
            )}
          </div>
        )}

        {productos.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4 shadow-sm my-8">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 text-[#FE6712] flex items-center justify-center mx-auto">
              <Boxes className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Catálogo sin productos</h3>
              <p className="text-xs text-slate-500 mt-1">Sincroniza tu catálogo desde Adonis, carga artículos manualmente o sube el archivo Excel.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                onClick={handleSincronizarAdonis}
                disabled={cargando}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition inline-flex items-center gap-2 shadow-sm disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${cargando ? "animate-spin" : ""}`} /> Sincronizar con Adonis
              </button>
              <button
                onClick={abrirModalNuevo}
                className="px-5 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition inline-flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Crear Manualmente
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold transition inline-flex items-center gap-2 border border-slate-200 shadow-sm"
              >
                <Upload className="w-4 h-4 text-[#FE6712]" /> Importar Excel
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-800">
                <thead className="bg-white border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-4">Foto</th>
                    <th className="p-4">Nombre del Producto</th>
                    <th className="p-4">Código / SKU</th>
                    <th className="p-4">Categoría</th>
                    <th className="p-4">Precio ($ USD)</th>
                    <th className="p-4">Precio (Bs.)</th>
                    <th className="p-4">Stock</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="p-10 text-center text-xs text-slate-400">
                        No se encontraron productos que coincidan con la búsqueda o el filtro.
                      </td>
                    </tr>
                  ) : (
                    productosFiltrados.map((item) => {
                      const precioReal = item?.metadata?.price?.basePrice ?? item?.price ?? 0;
                      const precio = Number(precioReal) || 0;
                      const agotado = estaAgotado(item);
                      const inactivo = item.status === "INACTIVE";
                      const fila = estadoFilas[item.id];
                      const guardandoFila = fila?.fase === "guardando";
                      return (
                        <tr key={item.id} className={`transition ${inactivo ? "bg-slate-50" : "hover:bg-slate-50"}`}>
                          <td className="p-4">
                            {/* eslint-disable-next-line @next/next/no-img-element -- imagen dinámica (Base64/URL arbitraria), incompatible con next/image sin configurar dominios */}
                            <img
                              src={item.image || IMAGEN_DEFECTO}
                              alt={item.name}
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                              onError={(e) => { e.target.src = IMAGEN_DEFECTO; }}
                            />
                          </td>
                          <td className="p-4 font-bold text-slate-800 max-w-xs">{item.name}</td>
                          <td className="p-4 text-slate-500 font-medium">{item.code}</td>
                          <td className="p-4 text-slate-600">{item.categoria || "—"}</td>
                          <td className="p-4">
                            <CeldaEditable
                              valor={precio}
                              prefijo="$"
                              etiqueta={`Precio en dólares de ${item.name}`}
                              deshabilitado={guardandoFila}
                              onGuardar={(nuevo) => handleEditarPrecio(item, nuevo)}
                            />
                          </td>
                          <td className="p-4 text-slate-600 font-semibold">
                            {tasa > 0
                              ? `Bs. ${(precio * tasa).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : "—"}
                          </td>
                          <td className="p-4">
                            <CeldaEditable
                              valor={item.stock}
                              entero
                              claseTexto="text-slate-700"
                              etiqueta={`Stock de ${item.name}`}
                              deshabilitado={guardandoFila}
                              onGuardar={(nuevo) => handleEditarStock(item, nuevo)}
                            />
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={!inactivo}
                                onClick={() => handleToggleEstado(item)}
                                disabled={guardandoFila}
                                title={inactivo ? "Inactivo: clic para activar" : "Activo: clic para desactivar"}
                                aria-label={`${inactivo ? "Activar" : "Desactivar"} ${item.name}`}
                                className={`w-8 h-5 shrink-0 rounded-full relative transition-colors disabled:opacity-60 ${inactivo ? "bg-slate-200" : "bg-[#FE6712]"}`}
                              >
                                <span className={`w-4 h-4 bg-white rounded-full shadow-sm absolute top-[2px] transition-all ${inactivo ? "left-[2px]" : "left-[14px]"}`} />
                              </button>
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border whitespace-nowrap ${
                                inactivo
                                  ? "bg-slate-100 text-slate-500 border-slate-200"
                                  : agotado
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}>
                                {inactivo ? "Inactivo" : agotado ? "Agotado" : "Disponible"}
                              </span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="w-4 h-4 flex items-center justify-center shrink-0" role="status" aria-live="polite" title={fila?.fase === "error" ? fila.mensaje : undefined}>
                                {fila?.fase === "guardando" && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" aria-label="Guardando" />}
                                {fila?.fase === "ok" && <Check className="w-3.5 h-3.5 text-emerald-600" aria-label="Guardado" />}
                                {fila?.fase === "error" && <X className="w-3.5 h-3.5 text-rose-600" aria-label="Error al guardar" />}
                              </span>
                              <button onClick={() => abrirModalJson(item)} title="Ver JSON v2" className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition border border-slate-200">
                                <FileJson className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => abrirModalEditar(item)} title="Editar" className="p-2 rounded-xl bg-white hover:bg-orange-50 text-slate-600 hover:text-[#FE6712] transition border border-slate-200">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleEliminarProducto(item)} title="Desactivar (baja lógica)" className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition border border-slate-200">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100 text-xs text-slate-500">
              Mostrando <strong>{productosFiltrados.length}</strong> de <strong>{productos.length}</strong> productos
              <span className="text-slate-400"> · Edita precio y stock directamente en la tabla: Enter o clic fuera para guardar, Esc para cancelar.</span>
            </div>
          </div>
        )}
      </main>

      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900">{productoEnEdicion ? "Editar Producto" : "Nuevo Producto"}</h3>
              <button onClick={() => setModalAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGuardarProducto} className="space-y-4">

              {/* Selector de Nicho (oculto en perfil Simple) */}
              {!esPerfilSimple && (
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Nicho / Rubro</label>
                  <div className="flex flex-wrap gap-1.5 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                    {NICHOS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, nicho: n }))}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
                          formData.nicho === n
                            ? "bg-[#FE6712] text-white shadow-sm"
                            : "bg-white text-slate-500 border border-slate-200 hover:border-[#FE6712] hover:text-[#FE6712]"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Campos Universales */}
              {!esPerfilSimple && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">SKU / Código Interno</label>
                    <input type="text" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Código de Barras</label>
                    <input type="text" value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} placeholder="Escanear o digitar..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Nombre *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
              </div>

              {esPerfilSimple ? (
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Categoría</label>
                  <input type="text" value={formData.categoria} onChange={(e) => setFormData({ ...formData, categoria: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Categoría</label>
                    <input type="text" value={formData.categoria} onChange={(e) => setFormData({ ...formData, categoria: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Subcategoría</label>
                    <input type="text" value={formData.subcategoria} onChange={(e) => setFormData({ ...formData, subcategoria: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Marca</label>
                    <input type="text" value={formData.marca} onChange={(e) => setFormData({ ...formData, marca: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Costo ($ USD)</label>
                  <input type="number" step="0.01" value={formData.costo} onChange={(e) => setFormData({ ...formData, costo: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Precio Base ($ USD) *</label>
                  <input type="number" step="0.01" required value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
                </div>
              </div>

              {(costoNum > 0 || priceNum > 0) && (
                <div className="flex items-center gap-4 px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] font-bold text-emerald-700">
                  <span>Margen Bruto: {margenBruto.toFixed(1)}%</span>
                  <span>Ganancia: ${ganancia.toFixed(2)}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Stock {esGastronomia && "(auto: suma de sabores)"}</label>
                  <input
                    type="number"
                    value={esGastronomia ? totalVariantesStock : formData.stock}
                    disabled={esGastronomia}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs disabled:opacity-60"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-600 block">Imagen</label>
                  <input type="file" ref={imageInputRef} onChange={handleImageFileChange} accept="image/*" className="hidden" />
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="w-full px-3.5 py-2 bg-slate-100 hover:bg-orange-50 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-200">
                    <Camera className="w-4 h-4 text-[#FE6712]" /> Subir foto local
                  </button>
                </div>
              </div>
              <input type="text" value={formData.image.startsWith("data:") ? "" : formData.image} onChange={(e) => setFormData({ ...formData, image: e.target.value })} placeholder="o pega una URL de imagen..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />

              {!esPerfilSimple && (
                <div>
                  <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                    <span>Descripción</span>
                    <span className="text-slate-400">{formData.descripcion.length} / 250</span>
                  </div>
                  <textarea rows="2" maxLength={250} value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none"></textarea>
                </div>
              )}

              {/* Toppings / Modificadores Opcionales (Gastronomía o General, no en perfil Simple) */}
              {mostrarToppings && !esPerfilSimple && (
                <div className="pt-3 border-t border-dashed border-slate-200 space-y-2">
                  <label className="text-[11px] font-bold text-slate-600 block">Toppings / Modificadores Opcionales</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nombre del extra (ej: Nutella)"
                      value={nuevoTopping.nombre}
                      onChange={(e) => setNuevoTopping({ ...nuevoTopping, nombre: e.target.value })}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="$"
                      value={nuevoTopping.precioExtra}
                      onChange={(e) => setNuevoTopping({ ...nuevoTopping, precioExtra: e.target.value })}
                      className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                    <button
                      type="button"
                      onClick={handleAgregarTopping}
                      className="px-3 py-2 bg-orange-50 hover:bg-[#FE6712] text-[#FE6712] hover:text-white border border-orange-200 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> Añadir
                    </button>
                  </div>
                  {formData.toppings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {formData.toppings.map((t) => (
                        <span key={t.id} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-[11px] font-bold text-orange-700">
                          {t.nombre} {Number(t.precioExtra) > 0 ? `(+$${Number(t.precioExtra).toFixed(2)})` : "(Gratis)"}
                          <button
                            type="button"
                            onClick={() => handleEliminarTopping(t.id)}
                            className="w-4 h-4 rounded-full bg-orange-200/60 hover:bg-rose-500 hover:text-white flex items-center justify-center transition"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Campos Dinámicos por Nicho (no en perfil Simple) */}
              {formData.nicho !== "General" && !esPerfilSimple && (
                <div className="pt-3 border-t border-dashed border-slate-200 space-y-3">
                  <h4 className="text-[11px] font-extrabold text-[#FE6712] uppercase tracking-wider flex items-center gap-1.5">
                    <LayersIcon className="w-3.5 h-3.5" /> Datos específicos: {formData.nicho}
                  </h4>

                  {formData.nicho === "Farmacia & Salud" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Principio Activo</label>
                          <input type="text" value={formData.principioActivo} onChange={(e) => setFormData({ ...formData, principioActivo: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Concentración / Dosis</label>
                          <input type="text" value={formData.concentracion} onChange={(e) => setFormData({ ...formData, concentracion: e.target.value })} placeholder="Ej: 500mg" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Presentación</label>
                          <input type="text" value={formData.presentacion} onChange={(e) => setFormData({ ...formData, presentacion: e.target.value })} placeholder="Ej: Caja x 20 tabletas" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Laboratorio</label>
                          <input type="text" value={formData.laboratorio} onChange={(e) => setFormData({ ...formData, laboratorio: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Registro Sanitario</label>
                          <input type="text" value={formData.registroSanitario} onChange={(e) => setFormData({ ...formData, registroSanitario: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Condición de Venta</label>
                          <select value={formData.condicionVenta} onChange={(e) => setFormData({ ...formData, condicionVenta: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                            <option value="Venta Libre">Venta Libre</option>
                            <option value="Bajo Récipe">Bajo Récipe</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 items-end">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Lote</label>
                          <input type="text" value={formData.lote} onChange={(e) => setFormData({ ...formData, lote: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Fecha de Vencimiento</label>
                          <input type="date" value={formData.fechaVencimiento} onChange={(e) => setFormData({ ...formData, fechaVencimiento: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={formData.cadenaFrio} onChange={(e) => setFormData({ ...formData, cadenaFrio: e.target.checked })} className="w-4 h-4 accent-[#FE6712]" />
                        <Snowflake className="w-3.5 h-3.5 text-cyan-600" /> Requiere Cadena de Frío
                      </label>
                    </div>
                  )}

                  {formData.nicho === "Tecnología & Hogar" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Modelo</label>
                          <input type="text" value={formData.modelo} onChange={(e) => setFormData({ ...formData, modelo: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Especificación Clave</label>
                          <input type="text" value={formData.especificacionClave} onChange={(e) => setFormData({ ...formData, especificacionClave: e.target.value })} placeholder="Ej: 12.000 BTU / 8GB RAM" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Voltaje</label>
                          <select value={formData.voltaje} onChange={(e) => setFormData({ ...formData, voltaje: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                            <option value="110V">110V</option>
                            <option value="220V">220V</option>
                            <option value="Bi-voltaje">Bi-voltaje</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Condición</label>
                          <select value={formData.condicion} onChange={(e) => setFormData({ ...formData, condicion: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                            <option value="Nuevo">Nuevo</option>
                            <option value="Refurbished">Refurbished</option>
                            <option value="Usado">Usado</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Meses de Garantía</label>
                          <input type="number" value={formData.mesesGarantia} onChange={(e) => setFormData({ ...formData, mesesGarantia: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.nicho === "Gastronomía & Heladería" && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Área de Despacho / Comanda</label>
                        <select value={formData.areaDespacho} onChange={(e) => setFormData({ ...formData, areaDespacho: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                          <option value="Cocina">Cocina</option>
                          <option value="Barra">Barra</option>
                          <option value="Empaque">Empaque</option>
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-bold text-slate-600">Variantes / Sabores</label>
                          <button type="button" onClick={handleAgregarVariante} className="text-[11px] font-bold text-[#FE6712] hover:underline flex items-center gap-1">
                            <Plus className="w-3.5 h-3.5" /> Añadir sabor
                          </button>
                        </div>
                        <div className="space-y-2">
                          {formData.variantes.length === 0 && (
                            <p className="text-[11px] text-slate-400 italic">Sin sabores añadidos. El stock total se calculará al agregar variantes.</p>
                          )}
                          {formData.variantes.map((v, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Ej: Chocolate"
                                value={v.nombre}
                                onChange={(e) => handleCambiarVariante(idx, "nombre", e.target.value)}
                                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                              />
                              <input
                                type="number"
                                placeholder="Stock"
                                value={v.stock}
                                onChange={(e) => handleCambiarVariante(idx, "stock", e.target.value)}
                                className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                              />
                              <button type="button" onClick={() => handleEliminarVariante(idx)} className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                        {formData.variantes.length > 0 && (
                          <p className="text-[11px] font-bold text-emerald-700 mt-2">Stock total calculado: {totalVariantesStock}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {formData.nicho === "Granel / Peso" && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Unidad de Medida</label>
                      <select value={formData.unidadMedida} onChange={(e) => setFormData({ ...formData, unidadMedida: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                        <option value="kg">Kilogramo (kg)</option>
                        <option value="gr">Gramo (gr)</option>
                        <option value="lt">Litro (lt)</option>
                        <option value="un">Unidad (un)</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalAbierto(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">Cancelar</button>
                <button type="submit" disabled={guardando} className="px-5 py-2 bg-[#FE6712] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-60">
                  {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {guardando ? "Guardando en Adonis..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Vista Previa JSON v2 */}
      {modalJsonAbierto && productoJsonActual && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Vista Previa · Marketplace Core v2</h3>
                <p className="text-xs text-slate-400">{productoJsonActual.name}</p>
              </div>
              <button onClick={() => setModalJsonAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="flex-1 overflow-auto bg-slate-50 text-slate-800 border border-slate-200 text-[11px] leading-relaxed rounded-2xl p-4 font-mono">
              {JSON.stringify(buildMarketplaceProductPayload(productoJsonActual), null, 2)}
            </pre>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setModalJsonAbierto(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

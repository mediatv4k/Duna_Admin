"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  Boxes, Upload, Download, ArrowLeft, Search,
  Plus, Edit3, Trash2, X, Check, Camera,
  Snowflake, IceCream2, Cpu, Pill, Scale, Layers as LayersIcon,
  Cloud, FileJson, RefreshCw
} from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { useBusinessProfile } from "@/context/BusinessProfileContext";
import { useUser } from "@/context/UserContext";
import { guardarDocumento, eliminarDocumento } from "@/lib/firebase";

const NICHOS = [
  "General",
  "Farmacia & Salud",
  "Tecnología & Hogar",
  "Gastronomía & Heladería",
  "Granel / Peso",
];

const IMAGEN_DEFECTO = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&q=80";

const ADONIS_BASE = "https://dev.carjos-marketplace.cloud";
const STORE_ID_DEFECTO = "47"; // Farma D'una Virtual
const ADONIS_HEADERS = {
  apiKey: "bf8f1b64-6342-48c5-af05-501e4c15a6cb",
  "Content-Type": "application/json",
};

async function pedirJsonAdonis(url, signal) {
  const res = await fetch(url, { headers: ADONIS_HEADERS, signal });
  if (!res.ok) throw new Error(`Adonis respondió HTTP ${res.status}`);
  return res.json();
}

// Adonis agrupa los artículos por categoría en data.products[].data; se aplanan a una sola lista
function aplanarProductosAdonis(respuesta) {
  const grupos = respuesta?.data?.products || [];
  return grupos.flatMap((grupo) => grupo.data || []);
}

const urlCatalogo = (storeId, pagina) =>
  `${ADONIS_BASE}/products/store/${storeId}?query=&page=${pagina}&category=&subCategory=`;

// Recorre todas las páginas del catálogo hasta reunir los productos completos
async function cargarCatalogoAdonis(storeId, signal) {
  const primera = await pedirJsonAdonis(urlCatalogo(storeId, 1), signal);
  let items = aplanarProductosAdonis(primera);
  const ultimaPagina = Number(primera?.data?.meta?.last_page) || 1;
  for (let p = 2; p <= ultimaPagina; p++) {
    items = items.concat(aplanarProductosAdonis(await pedirJsonAdonis(urlCatalogo(storeId, p), signal)));
  }
  return items;
}

async function cargarTasaAdonis(storeId, signal) {
  const info = await pedirJsonAdonis(`${ADONIS_BASE}/store/${storeId}/payment/info`, signal);
  return Number(info?.data?.store?.referenceRateValue) || 0;
}

function nombreCategoriaAdonis(item) {
  return item.category?.name || (typeof item.category === "string" ? item.category : "") || item.internalCategory || "";
}

// Esquema plano que consumen la tabla, la edición y las exportaciones
function mapearProductoAdonis(item) {
  return {
    id: `ADONIS-${item.id}`,
    adonisId: item.id,
    code: String(item.code || item.sku || item.id),
    name: item.name || "Sin Nombre",
    price: Number(item.price) || 0,
    stock: item.stock,
    categoria: nombreCategoriaAdonis(item) || "General",
    subcategoria: item.internalCategory || "",
    descripcion: String(item.description || "").slice(0, 250),
    image: item.image || item.pictureUrl || IMAGEN_DEFECTO,
    outOfStock: Boolean(item.outOfStock),
    origen: "ADONIS",
  };
}

// Con stock numérico rige stock > 0; si Adonis no lo informa, la disponibilidad la marca outOfStock
function estaAgotado(p) {
  if (p.outOfStock) return true;
  if (p.stock === undefined || p.stock === null) return false;
  return Number(p.stock) <= 0;
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

// Transforma un producto del inventario al esquema Marketplace Core v2 (AdonisJS)
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
    },
  };
}

export default function InventarioPage() {
  const { modoMoneda, tasaBcv } = useCurrency();
  const { perfil } = useBusinessProfile();
  const { usuario } = useUser();
  // Multi-tenant: tienda activa del usuario (storeId / comercio_id); por defecto Farma D'una Virtual
  const storeId = String(usuario?.storeId || usuario?.comercio_id || STORE_ID_DEFECTO);
  const esPerfilSimple = perfil === "SIMPLE";
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [cargando, setCargando] = useState(true);
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

  // Carga en vivo desde AdonisJS (catálogo + tasa oficial) de la tienda activa
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([cargarCatalogoAdonis(storeId, controller.signal), cargarTasaAdonis(storeId, controller.signal)])
      .then(([catalogo, tasa]) => {
        if (controller.signal.aborted) return;
        if (catalogo.status === "fulfilled") {
          setProductos(catalogo.value.map(mapearProductoAdonis));
          setError("");
        } else {
          console.error(catalogo.reason);
          setError("No se pudo cargar el catálogo desde Adonis. Verifica tu conexión e intenta de nuevo.");
        }
        if (tasa.status === "fulfilled") setTasaAdonis(tasa.value);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });
    return () => controller.abort();
  }, [storeId, recarga]);

  const actualizarProductos = (nuevos, idsEliminados = []) => {
    setProductos(nuevos);
    nuevos.forEach((p) => {
      guardarDocumento("duna_productos", p.id, p).catch((e) => console.error(e));
    });
    idsEliminados.forEach((id) => {
      eliminarDocumento("duna_productos", id).catch((e) => console.error(e));
    });
  };

  // Vuelve a consultar Adonis y refresca la tabla; no escribe en Firestore
  const handleSincronizarAdonis = () => {
    setCargando(true);
    setRecarga((n) => n + 1);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json(ws);

        const mapeados = data
          .filter(row => row.NOMBRE || row.CODIGO)
          .map((row, idx) => {
            const nicho = NICHOS.includes(row.NICHO) ? row.NICHO : "General";
            const variantes = nicho === "Gastronomía & Heladería" ? parseSabores(row.SABORES) : [];
            const stockManual = Number(row.CANTIDAD) || 0;
            const stockFinal = nicho === "Gastronomía & Heladería" && variantes.length > 0
              ? variantes.reduce((acc, v) => acc + (Number(v.stock) || 0), 0)
              : stockManual;

            return {
              id: String(row.CODIGO || `PROD-${Date.now()}-${idx}`),
              code: String(row.CODIGO || `P00${idx + 1}`),
              barcode: String(row.BARCODE || ""),
              categoria: row.CATEGORIA || "General",
              subcategoria: row.SUBCATEGORIA || "",
              marca: row.MARCA || "",
              name: row.NOMBRE || "Sin Nombre",
              descripcion: String(row.DESCRIPCION || "").slice(0, 250),
              costo: Number(row.COSTO) || 0,
              stock: stockFinal,
              minimo: Number(row.MINIMO) || 1,
              maximo: Number(row.MAXIMO) || 0,
              image: row.IMAGEN || IMAGEN_DEFECTO,
              status: row.STATUS || "ACTIVE",
              price: Number(row["PRECIO BASE"]) || 0,
              precioInfo: Number(row["PRECIO INFO"]) || 0,
              precioPromo: Number(row["PRECIO PROMO"]) || 0,
              labelPromo: row["LABEL PROMO"] || "",
              notaPromo: row["NOTA PROMO"] || "",
              orden: Number(row.ORDEN) || 0,
              peso: Number(row.PESO) || 0,
              volumen: Number(row.VOLUMEN) || 0,
              nicho,
              principioActivo: row.PRINCIPIO_ACTIVO || "",
              concentracion: row.CONCENTRACION || "",
              presentacion: row.PRESENTACION || "",
              laboratorio: row.LABORATORIO || "",
              registroSanitario: row.REGISTRO_SANITARIO || "",
              condicionVenta: row.CONDICION_VENTA || "Venta Libre",
              cadenaFrio: parseBooleano(row.CADENA_FRIO),
              lote: row.LOTE || "",
              fechaVencimiento: row.FECHA_VENCIMIENTO || "",
              modelo: row.MODELO || "",
              especificacionClave: row.ESPECIFICACION_CLAVE || "",
              voltaje: row.VOLTAJE || "110V",
              condicion: row.CONDICION || "Nuevo",
              mesesGarantia: Number(row.MESES_GARANTIA) || 0,
              variantes,
              areaDespacho: row.AREA_DESPACHO || "Cocina",
              toppings: parseToppings(row.TOPPINGS_MODIFICADORES),
              unidadMedida: row.UNIDAD_MEDIDA || "kg",
            };
          });

        // El Excel reemplaza el catálogo completo: los productos anteriores que no vienen en el archivo se eliminan también en Firestore
        const idsReemplazados = productos.filter(p => !mapeados.some(m => m.id === p.id)).map(p => p.id);
        actualizarProductos(mapeados, idsReemplazados);
        alert(`¡Catálogo importado! Se cargaron ${mapeados.length} productos.`);
      } catch (err) {
        alert("Error al leer el archivo Excel.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  const handleExportExcel = () => {
    const dataToExport = productos.length > 0 ? productos.map(p => ({
      CODIGO: p.code,
      CATEGORIA: p.categoria,
      SUBCATEGORIA: p.subcategoria || "",
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
        SUBCATEGORIA: "",
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
    XLSX.writeFile(wb, "Productos_Duna_Admin.xlsx");
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
    setProductoEnEdicion(prod);
    setFormData({
      ...FORM_INICIAL,
      ...prod,
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

  const handleGuardarProducto = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.price) {
      alert("Indica nombre y precio.");
      return;
    }

    const imagenFinal = formData.image.trim() || IMAGEN_DEFECTO;
    const stockFinal = esGastronomia ? totalVariantesStock : (Number(formData.stock) || 0);

    const base = {
      code: formData.code,
      barcode: formData.barcode,
      name: formData.name,
      categoria: formData.categoria,
      subcategoria: formData.subcategoria,
      marca: formData.marca,
      costo: Number(formData.costo) || 0,
      price: Number(formData.price) || 0,
      stock: stockFinal,
      image: imagenFinal,
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

    if (productoEnEdicion) {
      const actualizados = productos.map(p => {
        if (p.id === productoEnEdicion.id) {
          return { ...p, ...base };
        }
        return p;
      });
      actualizarProductos(actualizados);
    } else {
      const nuevo = {
        id: `PROD-${Date.now()}`,
        status: "ACTIVE",
        precioInfo: Number(formData.price) || 0,
        precioPromo: 0,
        labelPromo: "",
        notaPromo: "",
        orden: 0,
        peso: 0,
        volumen: 0,
        minimo: 1,
        maximo: 0,
        ...base,
      };
      actualizarProductos([nuevo, ...productos]);
    }
    setModalAbierto(false);
  };

  const handleEliminarProducto = (id) => {
    if (confirm("¿Seguro que deseas eliminar este producto?")) {
      actualizarProductos(productos.filter(p => p.id !== id), [id]);
    }
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

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col font-sans">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-[37px] z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition border border-slate-200">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <Link href="/" className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- logo local pequeño, no requiere optimización de next/image */}
                <img src="/logo-duna-admin.png" alt="D'una Admin" className="h-8 w-auto object-contain" />
                <span className="text-[11px] bg-orange-50 text-[#FE6712] px-2.5 py-0.5 rounded-full font-bold border border-orange-200">INVENTARIO</span>
              </Link>
              <p className="text-[11px] text-slate-400 font-medium">Catálogo sincronizado con Adonis y Firestore</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSincronizarAdonis}
              disabled={cargando}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${cargando ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{cargando ? "Actualizando..." : "Sincronizar con Adonis"}</span>
            </button>
            <button
              onClick={abrirModalNuevo}
              className="px-3.5 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nuevo Producto</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <Upload className="w-4 h-4 text-[#FE6712]" />
              <span className="hidden md:inline">Importar Excel</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span className="hidden md:inline">Exportar Excel</span>
            </button>
            <button
              onClick={handleExportMarketplace}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <Cloud className="w-4 h-4 text-slate-500" />
              <span className="hidden md:inline">Exportar Marketplace (JSON v2)</span>
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

        {productos.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4 shadow-sm my-8">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 text-[#FE6712] flex items-center justify-center mx-auto">
              <Boxes className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Catálogo sin productos</h3>
              <p className="text-xs text-slate-500 mt-1">Sincroniza el catálogo de Farma D&apos;una desde Adonis, carga artículos manualmente o sube el archivo Excel.</p>
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
                      const precio = Number(item.price) || 0;
                      const agotado = estaAgotado(item);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition">
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
                          <td className="p-4 font-black text-slate-900">${precio.toFixed(2)}</td>
                          <td className="p-4 text-slate-600 font-semibold">
                            {tasa > 0
                              ? `Bs. ${(precio * tasa).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : "—"}
                          </td>
                          <td className="p-4 font-bold text-slate-700">{item.stock ?? "—"}</td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                              agotado
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}>
                              {agotado ? "Agotado" : "Disponible"}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={() => abrirModalJson(item)} title="Ver JSON v2" className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition border border-slate-200">
                                <FileJson className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => abrirModalEditar(item)} title="Editar" className="p-2 rounded-xl bg-white hover:bg-orange-50 text-slate-600 hover:text-[#FE6712] transition border border-slate-200">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleEliminarProducto(item.id)} title="Eliminar" className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition border border-slate-200">
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
                <button type="submit" className="px-5 py-2 bg-[#FE6712] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
                  <Check className="w-4 h-4" /> Guardar
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

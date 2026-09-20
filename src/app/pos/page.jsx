"use client";
import TicketTermicoModal from '@/components/TicketTermicoModal';
import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, Plus, Check, X,
  Trash2, MessageCircle, ShieldCheck, Wallet, Copy, Settings, Smartphone,
  AlertTriangle, PauseCircle, History, CreditCard, Lock, Loader2, QrCode,
  Printer, ScanBarcode
} from "lucide-react";
import QRCode from "qrcode";
import { useCurrency } from "@/context/CurrencyContext";
import { useUser } from "@/context/UserContext";
import bancosVenezuela from "@/data/bancosVenezuela";
import { escucharColeccion, escucharDocumento, guardarDocumento, actualizarDocumento, eliminarDocumento } from "@/lib/firebase";

const METODOS_PAGO = [
  "Efectivo USD",
  "Efectivo Bs",
  "Pago Móvil",
  "Transf. Mismo Banco",
  "Transf. Interbancaria",
  "Punto de Venta",
  "Zelle",
];

const METODOS_CON_REFERENCIA = ["Pago Móvil", "Transf. Mismo Banco", "Transf. Interbancaria"];

const ADONIS_CATALOGO_URL = "https://dev.carjos-marketplace.cloud/products/store/47";
const ADONIS_CATALOGO_HEADERS = {
  apiKey: "bf8f1b64-6342-48c5-af05-501e4c15a6cb",
  "Content-Type": "application/json",
};

async function pedirPaginaCatalogoAdonis(pagina, signal) {
  const res = await fetch(`${ADONIS_CATALOGO_URL}?query=&page=${pagina}&category=&subCategory=`, {
    headers: ADONIS_CATALOGO_HEADERS,
    signal,
  });
  if (!res.ok) throw new Error(`Adonis respondió HTTP ${res.status}`);
  return res.json();
}

// Catálogo en vivo: aplana data.products[].data y recorre todas las páginas; conserva el id numérico real de Adonis
async function cargarCatalogoAdonisPos(signal) {
  const aplanar = (resp) => (resp?.data?.products || []).flatMap((grupo) => grupo.data || []);
  const primera = await pedirPaginaCatalogoAdonis(1, signal);
  let items = aplanar(primera);
  const ultimaPagina = Number(primera?.data?.meta?.last_page) || 1;
  for (let p = 2; p <= ultimaPagina; p++) {
    items = items.concat(aplanar(await pedirPaginaCatalogoAdonis(p, signal)));
  }
  // Stock real: detalle de cada producto en paralelo (data.stock, o 0 si no existe)
  const detalles = await Promise.allSettled(
    items.map(async (item) => {
      const res = await fetch(`https://dev.carjos-marketplace.cloud/product/${item.id}/web`, {
        headers: ADONIS_CATALOGO_HEADERS,
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
  );
  return items.map((item, i) => ({
    ...item,
    stock: detalles[i].status === "fulfilled" ? Number(detalles[i].value?.data?.stock ?? 0) : 0,
    id: item.id,
    adonisId: item.id,
    code: String(item.code || item.id),
    name: item.name || "Sin Nombre",
    price: Number(item.price) || 0,
    image: item.image || "",
    categoria: item.category?.name || (typeof item.category === "string" ? item.category : "") || item.internalCategory || "",
    outOfStock: Boolean(item.outOfStock),
  }));
}

const TIPOS_DOCUMENTO_VENTA = [
  { id: "FACTURA", label: "Factura Fiscal SENIAT" },
  { id: "NOTA", label: "Nota de Entrega" },
  { id: "COTIZACION", label: "Cotización" },
];

const ADONIS_PURCHASE_URL = "https://dev.carjos-marketplace.cloud/delivery/request/purchase/web";
const ADONIS_API_KEY = "bf8f1b64-6342-48c5-af05-501e4c15a6cb";

// Envía la venta a AdonisJS como PICKUP (multipart/form-data, campo orderData). Solo viajan los productos de su catálogo.
async function enviarPedidoAdonisPickup({ formVenta, documento, items, totalUsd, tasaReferencia, storeIdDefecto }) {
  const itemsAdonis = items.filter(
    (it) => String(it.codigo || "").toUpperCase().startsWith("FD") || String(it.productoId || "").includes("ADONIS")
  );
  if (itemsAdonis.length === 0) return { omitido: true };

  const storeId = Number(formVenta.storeId || storeIdDefecto || 47) || 47;
  const telefono = formVenta.telefono
    ? `${String(formVenta.paisCodigo || "+58").replace("+", "")}${limpiarTelefono(formVenta.telefono)}`
    : "";

  const orderData = {
    id: "",
    data: itemsAdonis.map((it) => {
      const unitario = Number(it.precioUnitario) || 0;
      return {
        id: Number(it.adonisId) || Number(String(it.productoId || "").replace("ADONIS-", "")) || 3534,
        code: it.codigo,
        name: it.nombre,
        image: it.imagen || "",
        cant: Number(it.cantidad) || 1,
        pricing: { unitBasePrice: unitario, addonsTotal: 0, unitFinalPrice: unitario },
        totalPrice: unitario * (Number(it.cantidad) || 1),
        variants: [],
      };
    }),
    service: "PICKUP",
    location: { lat: 0, lng: 0 },
    distance: "0",
    duration: "0",
    distanceText: "0 km",
    durationText: "0 min",
    serviceAmount: "0",
    tip: "",
    store: { id: storeId, phone: "584124708015" },
    foodStoreId: storeId,
    customerName: formVenta.cliente?.trim() || "Cliente Mostrador",
    customerDocument: documento || "V00000000",
    phone: telefono || "584120000000",
    address: formVenta.direccion?.trim() || "Retiro en tienda física",
    paymentRef: "PAGO-POS-MOSTRADOR",
    paymentMethod: { code: "EFECTIVO", value: "Efectivo Mostrador", field4: "USD", field5: "DEFAULT" },
    totalPaidDefaultAmount: totalUsd,
    totalPaidReferenceAmount: totalUsd * (Number(tasaReferencia) || 0),
    totalWithoutDiscount: totalUsd,
  };

  const formData = new FormData();
  formData.append("orderData", JSON.stringify(orderData));

  const res = await fetch(ADONIS_PURCHASE_URL, {
    method: "POST",
    headers: { apiKey: ADONIS_API_KEY, timeZone: "America/Caracas" },
    body: formData,
  });
  return res.json();
}

const FORM_VENTA_INICIAL = {
  cliente: "",
  tipoDocumento: "V-",
  numeroDocumento: "",
  paisCodigo: "+58",
  telefono: "",
  direccion: "",
  condicionVenta: "CREDITO",
  monedaAbono: "usd",
  montoAbonadoInput: "",
  metodoPago: "Efectivo USD",
  montoRecibido: "",
  bancoEmisor: "",
  bancoReceptor: "",
  referencia: "",
  titular: "",
  nota: "",
};

// Ítem en configuración antes de agregarse como renglón al ticket
const ITEM_ACTUAL_INICIAL = {
  productoId: "",
  varianteNombre: "",
  toppingsSeleccionadosIds: [],
  cantidad: 1,
};

// Datos fijos del comercio para Pago Móvil, con valores por defecto si el usuario aún no los configuró
const CONFIG_PAGOMOVIL_DEFECTO = {
  bancoReceptor: "0102",
  telefonoReceptor: "04141234567",
  rifReceptor: "J-12345678-0",
  nombreTitular: "Mi Comercio C.A.",
};

// Token corto de autoservicio para el portal público /pago/[token]
function generarTokenPago() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let sufijo = "";
  for (let i = 0; i < 6; i++) sufijo += chars[Math.floor(Math.random() * chars.length)];
  return `tk-${sufijo}`;
}

// Token efímero para la autorización de crédito por QR (/supervisor?token=...)
function generarTokenAuth() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let sufijo = "";
  for (let i = 0; i < 8; i++) sufijo += chars[Math.floor(Math.random() * chars.length)];
  return `auth-${sufijo}`;
}

const SEGUNDOS_EXPIRACION_QR = 60;
const PIN_EMERGENCIA_DEFECTO = "9999";

function limpiarTelefono(str) {
  return String(str || "").replace(/\D/g, "").replace(/^0+/, "");
}

function formatearBs(montoUsd, tasaBcv) {
  return (montoUsd * tasaBcv).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Origen público real (dominio de Vercel en producción, localhost en desarrollo); nunca hardcodeado
function obtenerOrigen() {
  return typeof window !== "undefined" ? window.location.origin : "";
}

// Normaliza cédula/RIF: quita puntos y espacios, mayúsculas, y asegura guion tras el prefijo (V, J, E, G, P)
function normalizarDocumento(raw) {
  if (!raw) return "";
  const limpio = String(raw).toUpperCase().replace(/[.\s]/g, "");
  const match = limpio.match(/^([VJEGP])-?(.+)$/);
  return match ? `${match[1]}-${match[2]}` : limpio;
}

// Extrae solo los dígitos de un documento, para búsqueda tolerante (ej: 'V-10.089.073' -> '10089073')
function extraerDigitos(raw) {
  return String(raw || "").replace(/\D/g, "");
}

// Extrae el prefijo formal (V-, J-, E-, G-, P-) de un documento guardado
function extraerPrefijo(raw) {
  const match = String(raw || "").toUpperCase().match(/^([VJEGP])-?/);
  return match ? `${match[1]}-` : "V-";
}

export default function POSPage() {
  // ESTADO TICKET TERMICO Y REIMPRESION
  const [modalTicketAbierto, setModalTicketAbierto] = React.useState(false);
  const [datosUltimoTicket, setDatosUltimoTicket] = React.useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('duna_ultimo_ticket') : null;
      return saved ? JSON.parse(saved) : null;
    } catch(e) { return null; }
  });

  const abrirTicket = (ventaData) => {
    const ticketData = ventaData || datosUltimoTicket || {
      numeroTicket: 'FAC-' + Math.floor(1000 + Math.random() * 9000),
      fecha: new Date().toISOString(),
      cliente: { nombre: 'Consumidor Final', cedula: 'V-00000000' },
      items: [{ nombre: 'Venta Mostrador', cantidad: 1, precio: 10 }],
      totalUSD: 10,
      tasa: 45.50,
      totalBs: 455,
      metodoPago: 'Efectivo',
      cajero: 'Omar Soto'
    };

  // AUTO-APERTURA DE TICKET TRAS COBRO
  const abrirTicketAuto = (metodoFinal) => {
    try {
      const prods = (typeof carrito !== 'undefined' && Array.isArray(carrito) && carrito.length > 0) ? [...carrito] :
                    (typeof cart !== 'undefined' && Array.isArray(cart) && cart.length > 0) ? [...cart] : [];
      const tUSD = typeof totalUSD === 'number' ? totalUSD :
                   typeof total === 'number' ? total :
                   prods.reduce((acc, it) => acc + (Number(it.precio || it.price || 0) * Number(it.cantidad || it.qty || 1)), 0);
      const tasaValor = typeof tasaBCV === 'number' ? tasaBCV :
                        typeof tasa === 'number' ? tasa : 45.50;
      const cli = typeof cliente === 'object' && cliente !== null ? cliente : {
        nombre: typeof nombreCliente === 'string' && nombreCliente ? nombreCliente : 'Consumidor Final',
        cedula: typeof cedulaCliente === 'string' && cedulaCliente ? cedulaCliente : 'V-00000000'
      };
      const ticketVenta = {
        numeroTicket: 'FAC-' + Math.floor(1000 + Math.random() * 9000),
        fecha: new Date().toISOString(),
        cliente: cli,
        items: prods.length > 0 ? prods : [{ nombre: 'Venta Mostrador', cantidad: 1, precio: tUSD || 10 }],
        totalUSD: tUSD || 10,
        tasa: tasaValor,
        totalBs: typeof totalBs === 'number' && totalBs > 0 ? totalBs : ((tUSD || 10) * tasaValor),
        metodoPago: (metodoFinal && typeof metodoFinal === 'string') ? metodoFinal.toUpperCase() :
                    (typeof metodoPago === 'string' ? metodoPago.toUpperCase() : 'EFECTIVO'),
        cajero: 'Omar Soto'
      };
      abrirTicket(ticketVenta);
    } catch(err) {
      console.warn('Error en auto ticket:', err);
      abrirTicket();
    }
  };

    setDatosUltimoTicket(ticketData);
    if (typeof window !== 'undefined') {
      localStorage.setItem('duna_ultimo_ticket', JSON.stringify(ticketData));
    }
    setModalTicketAbierto(true);
  };

  const { tasaBcv } = useCurrency();
  const { usuario } = useUser();
  const router = useRouter();

  const [cuentas, setCuentas] = useState([]);
  const [productosInventario, setProductosInventario] = useState([]);
  const [tipoDocumentoVenta, setTipoDocumentoVenta] = useState("FACTURA");
  const [fiscalMovilAbierto, setFiscalMovilAbierto] = useState(false);
  const [ticketMovilAbierto, setTicketMovilAbierto] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState("TODAS");
  const [tasaAdonis, setTasaAdonis] = useState(0);
  const [adonisConectado, setAdonisConectado] = useState(true);
  const [clientes, setClientes] = useState([]);
  const [turnos, setTurnos] = useState([]);

  const [formVenta, setFormVenta] = useState(FORM_VENTA_INICIAL);
  const [campoActivoSugerencia, setCampoActivoSugerencia] = useState(null);
  const [documentoBloqueado, setDocumentoBloqueado] = useState(false);
  const [errorDocumento, setErrorDocumento] = useState(false);

  const [renglonesVenta, setRenglonesVenta] = useState([]);
  const [itemActual, setItemActual] = useState(ITEM_ACTUAL_INICIAL);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [mostrarSugerenciasProducto, setMostrarSugerenciasProducto] = useState(false);
  const inputProductoRef = useRef(null);
  const inputDocumentoRef = useRef(null);

  const [modalCobroAbierto, setModalCobroAbierto] = useState(false);

  const [modalTurnoAbierto, setModalTurnoAbierto] = useState(false);
  const [montoInicialUsd, setMontoInicialUsd] = useState("");
  const [montoInicialBs, setMontoInicialBs] = useState("");

  const [configPagoMovil, setConfigPagoMovil] = useState(CONFIG_PAGOMOVIL_DEFECTO);
  const [modalConfigPagoMovilAbierto, setModalConfigPagoMovilAbierto] = useState(false);
  const [formConfigPagoMovil, setFormConfigPagoMovil] = useState(CONFIG_PAGOMOVIL_DEFECTO);
  const [copiadoDatosPagoMovil, setCopiadoDatosPagoMovil] = useState(false);
  const [campoCopiadoPM, setCampoCopiadoPM] = useState("");


  const [draftDetectado, setDraftDetectado] = useState(null);
  const [ventasEnEspera, setVentasEnEspera] = useState([]);
  const [modalEsperaAbierto, setModalEsperaAbierto] = useState(false);
  const [avisoClienteEnEspera, setAvisoClienteEnEspera] = useState(null);
  const [numeroTicketActual, setNumeroTicketActual] = useState(() => `FAC-${Date.now().toString().slice(-6)}`);

  // --- Autorización de Crédito por Supervisor (QR dinámico) ---
  const [modalAutorizacionAbierto, setModalAutorizacionAbierto] = useState(false);
  const [autorizacionActual, setAutorizacionActual] = useState(null);
  const [autorizacionCredito, setAutorizacionCredito] = useState(null);
  const [segundosRestantes, setSegundosRestantes] = useState(SEGUNDOS_EXPIRACION_QR);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [pinEmergenciaAbierto, setPinEmergenciaAbierto] = useState(false);
  const [pinEmergenciaInput, setPinEmergenciaInput] = useState("");

  // Cargar datos locales
  useEffect(() => {
    const guardadas = localStorage.getItem("duna_cxc_records");
    if (guardadas) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
        setCuentas(JSON.parse(guardadas));
      } catch (e) {
        console.error(e);
      }
    }

    const turnosGuardados = localStorage.getItem("duna_caja_turnos");
    if (turnosGuardados) {
      try {
        setTurnos(JSON.parse(turnosGuardados));
      } catch (e) {
        console.error(e);
      }
    }

    const configGuardada = localStorage.getItem("duna_config_pagomovil");
    if (configGuardada) {
      try {
        const parsed = JSON.parse(configGuardada);
        setConfigPagoMovil(parsed);
        setFormVenta(prev => ({ ...prev, bancoReceptor: parsed.bancoReceptor || "" }));
      } catch (e) {
        console.error(e);
      }
    } else {
      // Primera vez: siembra los datos de cobro con valores por defecto
      localStorage.setItem("duna_config_pagomovil", JSON.stringify(CONFIG_PAGOMOVIL_DEFECTO));
      setFormVenta(prev => ({ ...prev, bancoReceptor: CONFIG_PAGOMOVIL_DEFECTO.bancoReceptor }));
    }

    const borradorGuardado = localStorage.getItem("duna_pos_draft");
    if (borradorGuardado) {
      try {
        setDraftDetectado(JSON.parse(borradorGuardado));
      } catch (e) {
        console.error(e);
      }
    }

    const esperaGuardadas = localStorage.getItem("duna_ventas_espera");
    if (esperaGuardadas) {
      try {
        setVentasEnEspera(JSON.parse(esperaGuardadas));
      } catch (e) {
        console.error(e);
      }
    }

    inputDocumentoRef.current?.focus();
  }, []);

  // Catálogo de productos en vivo desde AdonisJS (fuente única; ya no se lee Firestore)
  useEffect(() => {
    const controller = new AbortController();
    cargarCatalogoAdonisPos(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setProductosInventario(items);
          setAdonisConectado(true);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          console.error("No se pudo cargar el catálogo de Adonis:", e);
          setAdonisConectado(false);
        }
      });
    return () => controller.abort();
  }, []);

  // Tasa oficial de la tienda (referenceRateValue) para el badge de la barra superior
  useEffect(() => {
    const controller = new AbortController();
    fetch("https://dev.carjos-marketplace.cloud/store/47/payment/info", { headers: ADONIS_CATALOGO_HEADERS, signal: controller.signal })
      .then((res) => res.json())
      .then((info) => {
        if (!controller.signal.aborted) setTasaAdonis(Number(info?.data?.store?.referenceRateValue) || 0);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Sincronización en tiempo real con Firestore (colección "duna_clientes"); sin variables de entorno,
  // degrada suavemente a localStorage.
  useEffect(() => {
    return escucharColeccion("duna_clientes", setClientes);
  }, []);

  // Auto-guardado continuo del ticket en curso (crash recovery): solo escribe en localStorage, sin setState
  useEffect(() => {
    if (!formVenta.cliente && renglonesVenta.length === 0) return;
    const borrador = {
      cliente: {
        nombre: formVenta.cliente,
        tipoDocumento: formVenta.tipoDocumento,
        numeroDocumento: formVenta.numeroDocumento,
        paisCodigo: formVenta.paisCodigo,
        telefono: formVenta.telefono,
        direccion: formVenta.direccion,
      },
      renglonesVenta,
      itemActual,
      condicionVenta: formVenta.condicionVenta,
      abonoInicial: formVenta.montoAbonadoInput,
      guardadoEn: new Date().toLocaleString("es-VE"),
    };
    localStorage.setItem("duna_pos_draft", JSON.stringify(borrador));
  }, [formVenta, renglonesVenta, itemActual]);

  const actualizarCuentas = (nuevas) => {
    setCuentas(nuevas);
    localStorage.setItem("duna_cxc_records", JSON.stringify(nuevas));
  };

  const actualizarConfigPagoMovil = (nuevaConfig) => {
    setConfigPagoMovil(nuevaConfig);
    localStorage.setItem("duna_config_pagomovil", JSON.stringify(nuevaConfig));
  };

  const abrirModalConfigPagoMovil = () => {
    setFormConfigPagoMovil(configPagoMovil);
    setModalConfigPagoMovilAbierto(true);
  };

  const handleGuardarConfigPagoMovil = () => {
    actualizarConfigPagoMovil(formConfigPagoMovil);
    setFormVenta(prev => ({ ...prev, bancoReceptor: formConfigPagoMovil.bancoReceptor || prev.bancoReceptor }));
    setModalConfigPagoMovilAbierto(false);
  };

  const actualizarClientes = (nuevos, clienteModificado) => {
    setClientes(nuevos);
    const porGuardar = clienteModificado ? [clienteModificado] : nuevos;
    porGuardar.forEach((c) => {
      guardarDocumento("duna_clientes", c.id, c).catch((e) => console.error(e));
    });
  };

  const actualizarTurnos = (nuevos) => {
    setTurnos(nuevos);
    localStorage.setItem("duna_caja_turnos", JSON.stringify(nuevos));
  };

  const turnoActivo = turnos.find(t => t.estado === "ABIERTA" && t.usuarioId === usuario?.id) || null;

  const handleAbrirTurno = (e) => {
    e.preventDefault();
    const nuevoTurno = {
      id: `caja_${Date.now().toString().slice(-6)}`,
      usuarioId: usuario?.id || "usr_01",
      fechaApertura: new Date().toLocaleString("es-VE"),
      montoInicialUsd: Number(montoInicialUsd) || 0,
      montoInicialBs: Number(montoInicialBs) || 0,
      estado: "ABIERTA",
      ventasIds: [],
    };
    actualizarTurnos([nuevoTurno, ...turnos]);
    setModalTurnoAbierto(false);
    setMontoInicialUsd("");
    setMontoInicialBs("");
  };

  const handleCerrarTurno = () => {
    if (!turnoActivo) return;
    if (!confirm(`¿Cerrar el turno ${turnoActivo.id}? Se registraron ${turnoActivo.ventasIds.length} venta(s).`)) return;
    actualizarTurnos(turnos.map(t => t.id === turnoActivo.id ? { ...t, estado: "CERRADA" } : t));
  };

  // Búsqueda predictiva por nombre o cédula/RIF (tolerante: compara solo dígitos)
  const filtrarClientes = (query) => {
    if (!query) return [];
    const q = query.toLowerCase();
    const qDigits = extraerDigitos(query);
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.documento || "").toLowerCase().includes(q) ||
      (qDigits.length >= 3 && extraerDigitos(c.documento).includes(qDigits))
    ).slice(0, 6);
  };

  const handleSeleccionarCliente = (cliente) => {
    const digitos = extraerDigitos(cliente.documento);
    setFormVenta(prev => ({
      ...prev,
      cliente: cliente.nombre,
      tipoDocumento: extraerPrefijo(cliente.documento),
      numeroDocumento: digitos,
      paisCodigo: cliente.codigoPais || "+58",
      telefono: cliente.telefono || "",
      direccion: cliente.direccion || "",
      condicionVenta: cliente.condicionVenta || "CREDITO",
    }));
    setErrorDocumento(false);
    if (digitos) setDocumentoBloqueado(true);
    setCampoActivoSugerencia(null);
  };

  // Escudo anti-duplicados + búsqueda tolerante: detección en tiempo real comparando solo dígitos
  const clienteCoincidenteActual = formVenta.numeroDocumento.length >= 5
    ? clientes.find(c => extraerDigitos(c.documento) === formVenta.numeroDocumento)
    : null;

  // Al tipear el número de documento: limpia a solo dígitos y evalúa coincidencia al instante
  const handleCambiarNumeroDocumento = (valor) => {
    const soloDigitos = extraerDigitos(valor);
    const match = soloDigitos.length >= 5
      ? clientes.find(c => extraerDigitos(c.documento) === soloDigitos)
      : null;

    setFormVenta(prev => ({
      ...prev,
      numeroDocumento: soloDigitos,
      ...(match ? {
        tipoDocumento: extraerPrefijo(match.documento),
        cliente: match.nombre,
        paisCodigo: match.codigoPais || prev.paisCodigo,
        telefono: match.telefono || prev.telefono,
        direccion: match.direccion || prev.direccion,
        condicionVenta: match.condicionVenta || "CREDITO",
      } : {}),
    }));
    setErrorDocumento(false);
    if (match) setDocumentoBloqueado(true);

    // Detección reactiva: ¿esta cédula ya tiene un ticket pausado en espera?
    const ventaEnEsperaCoincidente = soloDigitos.length >= 5
      ? ventasEnEspera.find(v => extraerDigitos(v.cliente?.numeroDocumento) === soloDigitos)
      : null;
    setAvisoClienteEnEspera(ventaEnEsperaCoincidente || null);
  };

  // Cédula/RIF es la clave única: se libera solo con una acción explícita del usuario
  const handleDesbloquearDocumento = () => {
    setDocumentoBloqueado(false);
    setFormVenta(prev => ({ ...prev, tipoDocumento: "V-", numeroDocumento: "", cliente: "", paisCodigo: "+58", telefono: "", direccion: "", condicionVenta: "CREDITO" }));
    setAvisoClienteEnEspera(null);
  };

  const productoSeleccionado = productosInventario.find(p => p.id === itemActual.productoId) || null;
  const esGastronomiaConVariantes = productoSeleccionado?.nicho === "Gastronomía & Heladería" && (productoSeleccionado.variantes || []).length > 0;

  // Buscador predictivo limpio: si está vacío, no se muestra ningún catálogo previo
  const coincidenciasBusqueda = busquedaProducto
    ? productosInventario.filter(p =>
        (p.name || "").toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        (p.code || "").toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        (p.sku || "").toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        (p.barcode || "").toLowerCase().includes(busquedaProducto.toLowerCase())
      )
    : [];
  // Solo se ofrecen productos con existencias: evita ventas en negativo en el mostrador
  const tieneExistencias = (p) => Number(p.stock) > 0 && !p.outOfStock;
  const productosFiltradosCombo = coincidenciasBusqueda.filter(tieneExistencias).slice(0, 8);
  const soloAgotadosEnBusqueda = coincidenciasBusqueda.length > 0 && productosFiltradosCombo.length === 0;

  const handleSeleccionarProducto = (prod) => {
    setItemActual({ productoId: prod.id, varianteNombre: "", toppingsSeleccionadosIds: [], cantidad: 1 });
    setBusquedaProducto(`${prod.code} - ${prod.name}`);
    setMostrarSugerenciasProducto(false);
  };

  // Añade (o fusiona con un renglón existente idéntico) un producto al ticket de venta
  const agregarProductoAlTicket = (producto, varianteNombre, toppingsSeleccionados, cantidadSolicitada) => {
    let cantidad = cantidadSolicitada;
    if (producto.stock !== undefined && producto.stock !== null && Number.isFinite(Number(producto.stock))) {
      const yaEnTicket = renglonesVenta.filter(r => r.productoId === producto.id).reduce((acc, r) => acc + r.cantidad, 0);
      const disponible = Number(producto.stock) - yaEnTicket;
      if (disponible <= 0) {
        alert(`No hay más existencias de "${producto.name}" (stock: ${producto.stock}).`);
        return;
      }
      if (cantidad > disponible) {
        cantidad = disponible;
        alert(`Solo hay ${producto.stock} unidades de "${producto.name}" en anaquel; se ajustó la cantidad a ${disponible}.`);
      }
    }
    const toppingsKey = toppingsSeleccionados.map(t => t.id).sort().join(",");
    const precioUnitario = producto.price + toppingsSeleccionados.reduce((acc, t) => acc + (Number(t.precioExtra) || 0), 0);

    setRenglonesVenta(prev => {
      const idxExistente = prev.findIndex(r =>
        r.productoId === producto.id &&
        (r.variante || "") === (varianteNombre || "") &&
        r.toppings.map(t => t.id).sort().join(",") === toppingsKey
      );

      if (idxExistente >= 0) {
        return prev.map((r, i) => {
          if (i !== idxExistente) return r;
          const nuevaCantidad = r.cantidad + cantidad;
          return { ...r, cantidad: nuevaCantidad, subtotal: r.precioUnitario * nuevaCantidad };
        });
      }

      const nuevoRenglon = {
        tempId: `tmp_${Date.now()}_${prev.length}`,
        productoId: producto.id,
        codigo: producto.code,
        nombre: producto.name,
        variante: varianteNombre || "",
        toppings: toppingsSeleccionados,
        cantidad,
        precioUnitario,
        subtotal: precioUnitario * cantidad,
      };
      return [...prev, nuevoRenglon];
    });
  };

  const handleAgregarAlTicket = () => {
    if (!itemActual.productoId || !productoSeleccionado) {
      alert("Selecciona un producto del catálogo.");
      return;
    }
    if (esGastronomiaConVariantes && !itemActual.varianteNombre) {
      alert("Selecciona el sabor o variante.");
      return;
    }
    const cantidad = Number(itemActual.cantidad) || 1;
    if (cantidad <= 0) {
      alert("Indica una cantidad válida.");
      return;
    }

    const toppingsSeleccionados = (productoSeleccionado.toppings || [])
      .filter(t => itemActual.toppingsSeleccionadosIds.includes(t.id))
      .map(t => ({ id: t.id, nombre: t.nombre, precioExtra: Number(t.precioExtra) || 0 }));

    agregarProductoAlTicket(productoSeleccionado, itemActual.varianteNombre, toppingsSeleccionados, cantidad);

    setItemActual(ITEM_ACTUAL_INICIAL);
    setBusquedaProducto("");
    inputProductoRef.current?.focus();
  };

  // Agrega un producto directamente desde la lista predictiva con 1 unidad
  const handleAgregarProductoDirecto = (prod) => {
    const requiereVariante = prod.nicho === "Gastronomía & Heladería" && (prod.variantes || []).length > 0;
    if (requiereVariante) {
      handleSeleccionarProducto(prod);
      return;
    }
    agregarProductoAlTicket(prod, "", [], 1);
    setBusquedaProducto("");
    setMostrarSugerenciasProducto(false);
    setItemActual(ITEM_ACTUAL_INICIAL);
    inputProductoRef.current?.focus();
  };

  // Enter tras escanear código de barras o primer resultado: si el producto no exige variante, se agrega 1 unidad directo al ticket
  const handleBusquedaProductoKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const match = productosInventario.find(p => p.barcode && p.barcode === busquedaProducto.trim() && tieneExistencias(p)) ||
                  productosFiltradosCombo[0];
    if (!match) return;

    handleAgregarProductoDirecto(match);
  };

  // Suma de recargos de los toppings actualmente seleccionados para el ítem en configuración
  const sumaToppingsSeleccionados = (productoSeleccionado?.toppings || [])
    .filter(t => itemActual.toppingsSeleccionadosIds.includes(t.id))
    .reduce((acc, t) => acc + (Number(t.precioExtra) || 0), 0);

  const precioUnitarioActual = (productoSeleccionado?.price || 0) + sumaToppingsSeleccionados;
  const subtotalActual = precioUnitarioActual * (Number(itemActual.cantidad) || 1);

  const handleToggleTopping = (topping) => {
    setItemActual(prev => {
      const yaSeleccionado = prev.toppingsSeleccionadosIds.includes(topping.id);
      const nuevosIds = yaSeleccionado
        ? prev.toppingsSeleccionadosIds.filter(id => id !== topping.id)
        : [...prev.toppingsSeleccionadosIds, topping.id];
      return { ...prev, toppingsSeleccionadosIds: nuevosIds };
    });
  };

  // Tope de unidades por producto según el stock real de anaquel (descontando lo ya cargado en otros renglones)
  const limitarAlStock = (renglones, renglon, deseada) => {
    const prod = productosInventario.find(p => p.id === renglon.productoId);
    if (!prod || prod.stock === undefined || prod.stock === null || !Number.isFinite(Number(prod.stock))) return deseada;
    const enOtros = renglones
      .filter(r => r.productoId === renglon.productoId && r.tempId !== renglon.tempId)
      .reduce((acc, r) => acc + r.cantidad, 0);
    return Math.max(1, Math.min(deseada, Number(prod.stock) - enOtros));
  };

  const handleActualizarCantidadRenglon = (tempId, nuevaCantidad) => {
    const deseada = Math.max(1, Number(nuevaCantidad) || 1);
    setRenglonesVenta(prev => prev.map(r => {
      if (r.tempId !== tempId) return r;
      const cant = limitarAlStock(prev, r, deseada);
      return { ...r, cantidad: cant, subtotal: r.precioUnitario * cant };
    }));
  };

  const handleIncrementarRenglon = (tempId) => {
    setRenglonesVenta(prev => prev.map(r => {
      if (r.tempId !== tempId) return r;
      const cant = limitarAlStock(prev, r, r.cantidad + 1);
      return { ...r, cantidad: cant, subtotal: r.precioUnitario * cant };
    }));
  };

  const handleDecrementarRenglon = (tempId) => {
    setRenglonesVenta(prev => prev.map(r => {
      if (r.tempId !== tempId) return r;
      const nuevaCantidad = Math.max(1, r.cantidad - 1);
      return { ...r, cantidad: nuevaCantidad, subtotal: r.precioUnitario * nuevaCantidad };
    }));
  };

  const handleEliminarRenglon = (tempId) => {
    setRenglonesVenta(prev => prev.filter(r => r.tempId !== tempId));
  };

  const totalFacturaUsd = renglonesVenta.reduce((acc, r) => acc + r.subtotal, 0);

  const montoAbonadoUsd = formVenta.monedaAbono === "ves"
    ? (Number(formVenta.montoAbonadoInput) || 0) / (tasaBcv || 1)
    : (Number(formVenta.montoAbonadoInput) || 0);

  const requiereDatosTransferenciaVenta = METODOS_CON_REFERENCIA.includes(formVenta.metodoPago);

  // Efectivo: monto recibido y vuelto exacto en la moneda entregada por el cliente
  const esEfectivoUsd = formVenta.metodoPago === "Efectivo USD";
  const esEfectivoBs = formVenta.metodoPago === "Efectivo Bs";
  const montoACobrarUsd = formVenta.condicionVenta === "CONTADO" ? totalFacturaUsd : montoAbonadoUsd;
  const montoACobrarMoneda = esEfectivoBs ? montoACobrarUsd * (tasaBcv || 1) : montoACobrarUsd;
  const montoRecibidoNum = Number(formVenta.montoRecibido) || 0;
  const vueltoEfectivo = Math.max(0, montoRecibidoNum - montoACobrarMoneda);
  const faltanteEfectivo = Math.max(0, montoACobrarMoneda - montoRecibidoNum);
  const efectivoInsuficiente = (esEfectivoUsd || esEfectivoBs) && montoACobrarUsd > 0 && faltanteEfectivo > 0.005;

  // Candado de crédito: solo se exige autorización si la venta a crédito deja saldo pendiente real
  const saldoProyectadoCobro = Math.max(0, totalFacturaUsd - (formVenta.condicionVenta === "CONTADO" ? totalFacturaUsd : montoAbonadoUsd));
  const requiereAutorizacionSupervisor = formVenta.condicionVenta === "CREDITO" && saldoProyectadoCobro > 0;

  // Referencias ya usadas en cualquier abono registrado, para evitar duplicidad
  const referenciasUsadas = new Set(
    cuentas.flatMap(c => (c.historialAbonos || []).map(h => h.referencia).filter(Boolean))
  );

  // Escudo anti-duplicados en tiempo real: se valida mientras se tipea la referencia
  const referenciaVentaDuplicada = requiereDatosTransferenciaVenta &&
    formVenta.referencia.trim().length > 0 &&
    referenciasUsadas.has(formVenta.referencia.trim());

  // Datos de cobro por Pago Móvil (banco receptor configurado en la caja)
  const bancoReceptorSeleccionado = bancosVenezuela.find(b => b.codigo === formVenta.bancoReceptor) || null;
  const montoPagoMovilUsd = formVenta.condicionVenta === "CONTADO" ? totalFacturaUsd : montoAbonadoUsd;
  const datosPagoMovil = [
    { campo: "banco", etiqueta: "Banco", valor: bancoReceptorSeleccionado ? bancoReceptorSeleccionado.display : "Sin configurar" },
    { campo: "tel", etiqueta: "Teléfono", valor: configPagoMovil.telefonoReceptor || "Sin configurar" },
    { campo: "rif", etiqueta: "Cédula / RIF", valor: configPagoMovil.rifReceptor || "Sin configurar" },
    { campo: "monto", etiqueta: "Monto", valor: `Bs. ${formatearBs(montoPagoMovilUsd, tasaBcv)}` },
  ];

  const handleCopiarDatosPagoMovil = async () => {
    const [banco, tel, rif, monto] = datosPagoMovil.map(d => d.valor);
    try {
      await navigator.clipboard.writeText(`Banco: ${banco} | Tel: ${tel} | RIF: ${rif} | Monto: ${monto}`);
      setCopiadoDatosPagoMovil(true);
      setTimeout(() => setCopiadoDatosPagoMovil(false), 1500);
    } catch (e) {
      alert("No se pudo copiar automáticamente.");
    }
  };

  const handleCopiarCampoPagoMovil = async (valor, campo) => {
    try {
      await navigator.clipboard.writeText(String(valor));
      setCampoCopiadoPM(campo);
      setTimeout(() => setCampoCopiadoPM(""), 1500);
    } catch (e) {
      alert("No se pudo copiar automáticamente.");
    }
  };

  // Genera el QR (data URL) apuntando al portal móvil del supervisor cada vez que hay un token nuevo pendiente
  useEffect(() => {
    if (!autorizacionActual || autorizacionActual.status !== "PENDIENTE") return undefined;
    let cancelado = false;
    const urlSupervisor = `${obtenerOrigen()}/supervisor?token=${autorizacionActual.tokenAuth}`;
    QRCode.toDataURL(urlSupervisor, { width: 220, margin: 1, color: { dark: "#0a0e17", light: "#ffffff" } })
      .then((dataUrl) => {
        if (!cancelado) setQrDataUrl(dataUrl);
      })
      .catch((err) => console.error(err));
    return () => { cancelado = true; };
  }, [autorizacionActual]);

  // Contador regresivo de 60 a 0; al llegar a cero marca el token como EXPIRADA en el registro compartido
  useEffect(() => {
    if (!modalAutorizacionAbierto || autorizacionActual?.status !== "PENDIENTE") return undefined;
    const intervalo = setInterval(() => {
      const restante = Math.max(0, Math.round((autorizacionActual.expiraEn - Date.now()) / 1000));
      setSegundosRestantes(restante);
      if (restante === 0) {
        actualizarDocumento("duna_autorizaciones_credito", autorizacionActual.tokenAuth, { status: "EXPIRADA" }).catch((e) => console.error(e));
        setAutorizacionActual(prev => (prev ? { ...prev, status: "EXPIRADA" } : prev));
      }
    }, 1000);
    return () => clearInterval(intervalo);
  }, [modalAutorizacionAbierto, autorizacionActual]);

  // Listener reactivo (Firestore en vivo, o polling local): detecta si el supervisor ya aprobó/rechazó desde su teléfono
  useEffect(() => {
    if (!modalAutorizacionAbierto || autorizacionActual?.status !== "PENDIENTE") return undefined;
    return escucharDocumento("duna_autorizaciones_credito", autorizacionActual.tokenAuth, (match) => {
      if (match && match.status !== "PENDIENTE") {
        setAutorizacionActual(match);
        if (match.status === "APROBADA") setAutorizacionCredito(match.supervisorInfo);
      }
    }, 1500);
  }, [modalAutorizacionAbierto, autorizacionActual]);

  const abrirModalAutorizacion = () => {
    const token = generarTokenAuth();
    const registro = {
      tokenAuth: token,
      cajaId: usuario?.id || "caja_01",
      clienteDocumento: normalizarDocumento(`${formVenta.tipoDocumento}${formVenta.numeroDocumento}`) || "S/D",
      clienteNombre: formVenta.cliente || "Consumidor Final",
      montoUsd: totalFacturaUsd,
      montoBs: totalFacturaUsd * tasaBcv,
      expiraEn: Date.now() + SEGUNDOS_EXPIRACION_QR * 1000,
      status: "PENDIENTE",
      supervisorInfo: null,
    };
    guardarDocumento("duna_autorizaciones_credito", token, registro).catch((e) => console.error(e));
    setQrDataUrl("");
    setAutorizacionActual({ ...registro, id: token });
    setSegundosRestantes(SEGUNDOS_EXPIRACION_QR);
    setPinEmergenciaAbierto(false);
    setPinEmergenciaInput("");
    setModalAutorizacionAbierto(true);
  };

  const handlePausarPorAutorizacion = () => {
    setModalAutorizacionAbierto(false);
    setAutorizacionActual(null);
    handlePonerEnEspera();
  };

  // Guarda la venta y registra la cuenta por cobrar; recibe los datos del supervisor cuando aplica
  const registrarVenta = (autorizadoPor) => {
    const esContado = formVenta.condicionVenta === "CONTADO";
    const abonado = esContado ? totalFacturaUsd : montoAbonadoUsd;

    const documentoFinal = normalizarDocumento(`${formVenta.tipoDocumento}${formVenta.numeroDocumento}`);
    const saldoPendiente = Math.max(0, totalFacturaUsd - abonado);
    const estado = saldoPendiente === 0 ? "PAGADO" : abonado > 0 ? "PARCIAL" : "PENDIENTE";

    const historialAbonos = abonado > 0 ? [{
      fecha: new Date().toLocaleString("es-VE"),
      moneda: esContado ? "usd" : formVenta.monedaAbono,
      montoOriginal: esContado ? totalFacturaUsd : (Number(formVenta.montoAbonadoInput) || 0),
      tasaBcv,
      montoUsd: abonado,
      metodoPago: formVenta.metodoPago,
      bancoEmisor: requiereDatosTransferenciaVenta ? formVenta.bancoEmisor : "",
      bancoReceptor: requiereDatosTransferenciaVenta ? formVenta.bancoReceptor : "",
      referencia: requiereDatosTransferenciaVenta ? formVenta.referencia.trim() : "",
      titular: requiereDatosTransferenciaVenta ? formVenta.titular : "",
    }] : [];

    const idTicketGenerado = numeroTicketActual || `FAC-${Date.now().toString().slice(-6)}`;
    const nuevaCuenta = {
      id: idTicketGenerado,
      fecha: new Date().toLocaleDateString("es-VE"),
      cliente: formVenta.cliente || "Consumidor Final",
      documento: documentoFinal || "S/D",
      paisCodigo: formVenta.paisCodigo,
      telefono: formVenta.telefono || "",
      renglones: renglonesVenta,
      cantidad: renglonesVenta.reduce((acc, r) => acc + r.cantidad, 0),
      total: totalFacturaUsd,
      abonado,
      saldo: saldoPendiente,
      estado,
      historialAbonos,
      autorizadoPor: autorizadoPor || null,
    };

    // Ticket térmico final: se arma con los datos de la venta antes de limpiar el formulario
    const tasaTicket = tasaBcv || 45.50;
    const ticketVenta = {
      numeroTicket: idTicketGenerado,
      fecha: new Date().toISOString(),
      cliente: {
        nombre: formVenta.cliente.trim() || "Consumidor Final",
        cedula: documentoFinal || "S/D",
        telefono: formVenta.telefono || "",
        direccion: formVenta.direccion || "",
      },
      items: renglonesVenta.map(r => ({
        nombre: `${r.nombre}${r.variante ? ` (${r.variante})` : ""}`,
        cantidad: r.cantidad,
        precio: r.precioUnitario,
      })),
      totalUSD: totalFacturaUsd,
      tasa: tasaTicket,
      totalBs: totalFacturaUsd * tasaTicket,
      metodoPago: (formVenta.metodoPago || "Efectivo USD").toUpperCase(),
      cajero: usuario?.nombre || "Cajero Principal",
    };

    // Escudo anti-duplicados: upsert por cédula/RIF normalizada (clave única)
    const clienteExistente = documentoFinal
      ? clientes.find(c => normalizarDocumento(c.documento) === documentoFinal)
      : clientes.find(c => !c.documento && c.nombre.toLowerCase() === formVenta.cliente.toLowerCase());
    const clienteActualizado = {
      id: clienteExistente?.id || `cli_${Date.now()}`,
      documento: documentoFinal,
      cedula: documentoFinal,
      nombre: formVenta.cliente,
      codigoPais: formVenta.paisCodigo,
      telefono: formVenta.telefono || "",
      direccion: formVenta.direccion || "",
      sucursalId: usuario?.sucursalId || "",
      condicionVenta: formVenta.condicionVenta,
      limiteCredito: clienteExistente?.limiteCredito || 0,
      fechaRegistro: clienteExistente?.fechaRegistro || new Date().toISOString(),
    };
    if (documentoFinal !== "V-00000000") {
      if (clienteExistente) {
        actualizarClientes(clientes.map(c => c === clienteExistente ? clienteActualizado : c), clienteActualizado);
      } else {
        actualizarClientes([clienteActualizado, ...clientes], clienteActualizado);
      }
    }

    // Adjuntar la venta al turno de caja activo
    if (turnoActivo) {
      actualizarTurnos(turnos.map(t =>
        t.id === turnoActivo.id ? { ...t, ventasIds: [...t.ventasIds, nuevaCuenta.id] } : t
      ));
    }

    actualizarCuentas([nuevaCuenta, ...cuentas]);

    // Envío a Adonis (PICKUP) en segundo plano: la caja nunca espera la respuesta
    enviarPedidoAdonisPickup({
      formVenta,
      documento: documentoFinal,
      items: renglonesVenta.map(r => {
        const inv = productosInventario.find(p => p.id === r.productoId);
        return { ...r, adonisId: inv?.adonisId, imagen: inv?.image };
      }),
      totalUsd: totalFacturaUsd,
      tasaReferencia: tasaBcv,
      storeIdDefecto: usuario?.storeId,
    })
      .then((resp) => {
        console.log("Adonis PICKUP:", resp);
        // code === 1: descuento visual inmediato del stock vendido, para la siguiente búsqueda
        if (resp?.code === 1) {
          setProductosInventario(prev => prev.map(p => {
            const vendido = renglonesVenta.filter(r => r.productoId === p.id).reduce((acc, r) => acc + r.cantidad, 0);
            if (vendido === 0 || p.stock === undefined || p.stock === null) return p;
            return { ...p, stock: Math.max(0, Number(p.stock) - vendido) };
          }));
        }
        // code === 1: el pedido quedó registrado; se guarda el recibo devuelto junto al último ticket
        if (resp?.code === 1 && resp?.data?.url) {
          const conRecibo = { ...ticketVenta, urlRecibo: resp.data.url };
          setDatosUltimoTicket(conRecibo);
          localStorage.setItem("duna_ultimo_ticket", JSON.stringify(conRecibo));
        }
      })
      .catch((err) => console.warn("Adonis PICKUP no disponible:", err));

    setTicketMovilAbierto(false);
    setModalCobroAbierto(false);
    setModalAutorizacionAbierto(false);
    setAutorizacionActual(null);
    setAutorizacionCredito(null);
    setQrDataUrl("");
    setFormVenta({ ...FORM_VENTA_INICIAL, bancoReceptor: configPagoMovil.bancoReceptor || "" });
    setRenglonesVenta([]);
    setItemActual(ITEM_ACTUAL_INICIAL);
    setBusquedaProducto("");
    setDocumentoBloqueado(false);
    setErrorDocumento(false);
    setAvisoClienteEnEspera(null);
    // Venta formalizada: el borrador de recuperación ya no aplica
    localStorage.removeItem("duna_pos_draft");
    setDraftDetectado(null);
    setNumeroTicketActual(`FAC-${Date.now().toString().slice(-6)}`);
    inputDocumentoRef.current?.focus();

    // Pago confirmado y venta registrada: recién ahora se muestra el ticket térmico
    setDatosUltimoTicket(ticketVenta);
    if (typeof window !== "undefined") {
      localStorage.setItem("duna_ultimo_ticket", JSON.stringify(ticketVenta));
    }
    setModalTicketAbierto(true);
  };

  // Tras el check verde de aprobación: continúa la facturación automáticamente
  useEffect(() => {
    if (autorizacionActual?.status !== "APROBADA") return undefined;
    const timeout = setTimeout(() => {
      registrarVenta(autorizacionActual.supervisorInfo);
    }, 1400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registrarVenta se recrea cada render; solo debe reprogramarse cuando cambia el estado de la autorización
  }, [autorizacionActual]);

  const handleValidarPinEmergencia = () => {
    const configGuardada = JSON.parse(localStorage.getItem("duna_config_supervisores") || "null");
    const pinValido = configGuardada?.pinMaestro || PIN_EMERGENCIA_DEFECTO;
    if (pinEmergenciaInput.trim() !== pinValido) {
      alert("PIN incorrecto.");
      return;
    }
    const supervisorInfo = {
      supervisorNombre: "PIN de Emergencia",
      supervisorId: "PIN-EMERGENCIA",
      horaAutorizacion: new Date().toLocaleString("es-VE"),
    };
    if (autorizacionActual) {
      actualizarDocumento("duna_autorizaciones_credito", autorizacionActual.tokenAuth, { status: "APROBADA", supervisorInfo }).catch((e) => console.error(e));
    }
    setAutorizacionCredito(supervisorInfo);
    setPinEmergenciaAbierto(false);
    setPinEmergenciaInput("");
    registrarVenta(supervisorInfo);
  };

  // Valida el formulario y decide si hace falta autorización de supervisor antes de registrar
  const handleCrearVenta = (e) => {
    e.preventDefault();
    if (!formVenta.cliente || renglonesVenta.length === 0) {
      alert("Indica el cliente y agrega al menos un producto al ticket.");
      return;
    }

    if (formVenta.numeroDocumento.trim().length < 5) {
      setErrorDocumento(true);
      alert("La Cédula o RIF es obligatoria para emitir la factura.");
      return;
    }
    setErrorDocumento(false);

    const esContado = formVenta.condicionVenta === "CONTADO";
    const abonado = esContado ? totalFacturaUsd : montoAbonadoUsd;

    if (abonado > 0 && requiereDatosTransferenciaVenta) {
      const ref = formVenta.referencia.trim();
      if (!ref) {
        alert("Indica el número de referencia del pago.");
        return;
      }
      if (referenciasUsadas.has(ref)) {
        alert("Esta referencia ya fue registrada anteriormente. Verifica el número.");
        return;
      }
    }

    // Candado de autorización: una venta a crédito que deja saldo pendiente exige el visto bueno de un supervisor
    const saldoProyectado = Math.max(0, totalFacturaUsd - abonado);
    if (!esContado && saldoProyectado > 0 && !autorizacionCredito) {
      abrirModalAutorizacion();
      return;
    }

    registrarVenta(autorizacionCredito);
  };

  // Valida cliente y productos y abre la pasarela de métodos de pago
  const handleAbrirCobro = () => {
    if (!formVenta.numeroDocumento.trim() || !formVenta.cliente.trim()) {
      setErrorDocumento(true);
      alert("Debe ingresar la Cédula/RIF del cliente para facturar");
      return;
    }
    if (renglonesVenta.length === 0) {
      alert("Agrega al menos un producto al ticket antes de confirmar la venta.");
      return;
    }

    // Solo abre la pasarela de cobro; la venta y el ticket ocurren al confirmar el pago
    setModalCobroAbierto(true);
  };

  const handleLimpiarTicket = () => {
    if (renglonesVenta.length > 0 && !confirm("¿Vaciar el ticket actual y empezar de nuevo?")) return;
    setModalCobroAbierto(false);
    setModalAutorizacionAbierto(false);
    setAutorizacionActual(null);
    setAutorizacionCredito(null);
    setQrDataUrl("");
    setFormVenta({ ...FORM_VENTA_INICIAL, bancoReceptor: configPagoMovil.bancoReceptor || "" });
    setRenglonesVenta([]);
    setItemActual(ITEM_ACTUAL_INICIAL);
    setBusquedaProducto("");
    setDocumentoBloqueado(false);
    setErrorDocumento(false);
    setAvisoClienteEnEspera(null);
    setNumeroTicketActual(`FAC-${Date.now().toString().slice(-6)}`);
    inputDocumentoRef.current?.focus();
  };

  // --- Borrador de recuperación (crash recovery) ---

  const totalBorrador = (draftDetectado?.renglonesVenta || []).reduce((acc, r) => acc + r.subtotal, 0);

  const handleRetomarBorrador = () => {
    if (!draftDetectado) return;
    const c = draftDetectado.cliente || {};
    setFormVenta(prev => ({
      ...FORM_VENTA_INICIAL,
      bancoReceptor: prev.bancoReceptor,
      cliente: c.nombre || "",
      tipoDocumento: c.tipoDocumento || "V-",
      numeroDocumento: c.numeroDocumento || "",
      paisCodigo: c.paisCodigo || "+58",
      telefono: c.telefono || "",
      direccion: c.direccion || "",
      condicionVenta: draftDetectado.condicionVenta || "CREDITO",
      montoAbonadoInput: draftDetectado.abonoInicial || "",
    }));
    setRenglonesVenta(draftDetectado.renglonesVenta || []);
    setItemActual(draftDetectado.itemActual || ITEM_ACTUAL_INICIAL);
    if (c.numeroDocumento) setDocumentoBloqueado(true);
    setDraftDetectado(null);
  };

  const handleDescartarBorrador = () => {
    setDraftDetectado(null);
    localStorage.removeItem("duna_pos_draft");
  };

  // --- Ventas en Espera (Parked Sales) ---

  const actualizarVentasEnEspera = (nuevas) => {
    setVentasEnEspera(nuevas);
    localStorage.setItem("duna_ventas_espera", JSON.stringify(nuevas));
  };

  const handlePonerEnEspera = () => {
    if (renglonesVenta.length === 0) return;
    const ventaEnEspera = {
      id: `espera_${Date.now()}`,
      fechaHora: new Date().toLocaleString("es-VE"),
      cliente: {
        nombre: formVenta.cliente,
        tipoDocumento: formVenta.tipoDocumento,
        numeroDocumento: formVenta.numeroDocumento,
        paisCodigo: formVenta.paisCodigo,
        telefono: formVenta.telefono,
        direccion: formVenta.direccion,
      },
      renglonesVenta,
      condicionVenta: formVenta.condicionVenta,
      total: totalFacturaUsd,
    };
    actualizarVentasEnEspera([ventaEnEspera, ...ventasEnEspera]);

    setModalCobroAbierto(false);
    setModalAutorizacionAbierto(false);
    setAutorizacionActual(null);
    setAutorizacionCredito(null);
    setQrDataUrl("");
    setFormVenta({ ...FORM_VENTA_INICIAL, bancoReceptor: configPagoMovil.bancoReceptor || "" });
    setRenglonesVenta([]);
    setItemActual(ITEM_ACTUAL_INICIAL);
    setBusquedaProducto("");
    setDocumentoBloqueado(false);
    setErrorDocumento(false);
    setAvisoClienteEnEspera(null);
    localStorage.removeItem("duna_pos_draft");
    setDraftDetectado(null);
    inputDocumentoRef.current?.focus();

    alert("Venta guardada en espera");
  };

  const handleRetomarVentaEnEspera = (venta) => {
    const c = venta.cliente || {};
    setFormVenta(prev => ({
      ...FORM_VENTA_INICIAL,
      bancoReceptor: prev.bancoReceptor,
      cliente: c.nombre || "",
      tipoDocumento: c.tipoDocumento || "V-",
      numeroDocumento: c.numeroDocumento || "",
      paisCodigo: c.paisCodigo || "+58",
      telefono: c.telefono || "",
      direccion: c.direccion || "",
      condicionVenta: venta.condicionVenta || "CREDITO",
    }));
    setRenglonesVenta(venta.renglonesVenta || []);
    setItemActual(ITEM_ACTUAL_INICIAL);
    if (c.numeroDocumento) setDocumentoBloqueado(true);

    actualizarVentasEnEspera(ventasEnEspera.filter(v => v.id !== venta.id));
    setAvisoClienteEnEspera(null);
    setModalEsperaAbierto(false);
  };

  const handleEliminarVentaEnEspera = (id) => {
    if (!confirm("¿Eliminar esta venta en espera?")) return;
    actualizarVentasEnEspera(ventasEnEspera.filter(v => v.id !== id));
  };

  const tasaOficial = tasaAdonis || tasaBcv;

  // Categorías y grilla del catálogo
  const categoriasCatalogo = [...new Set(productosInventario.map(p => p.categoria).filter(Boolean))].sort();
  const productosGrilla = productosInventario.filter(p => {
    if (categoriaActiva !== "TODAS" && p.categoria !== categoriaActiva) return false;
    const q = busquedaProducto.trim().toLowerCase();
    if (!q) return true;
    return (p.name || "").toLowerCase().includes(q) ||
      (p.code || "").toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q) ||
      (p.barcode || "").toLowerCase().includes(q);
  });

  // Desglose fiscal informativo: los precios del catálogo se consideran con IVA 16% incluido
  const subtotalBrutoUsd = totalFacturaUsd;
  const baseImponibleUsd = totalFacturaUsd / 1.16;
  const ivaUsd = totalFacturaUsd - baseImponibleUsd;

  const handleConsumidorFinal = () => {
    setFormVenta(prev => ({
      ...prev,
      tipoDocumento: "V-",
      numeroDocumento: "00000000",
      cliente: "Consumidor Final",
      paisCodigo: "+58",
      telefono: "4120000000",
      direccion: "Retiro en tienda física",
    }));
    setErrorDocumento(false);
  };

  // Cierra la terminal flotante y regresa al módulo anterior (o a Inventario si no hay historial)
  const handleSalirTerminal = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/inventario");
  };

  // Atajos de teclado globales: F2 buscador, F8 retener, F12 cobrar, Esc cierra el modal abierto, limpia la búsqueda o sale
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "F2") {
        e.preventDefault();
        inputProductoRef.current?.focus();
        inputProductoRef.current?.select();
      } else if (e.key === "F8") {
        e.preventDefault();
        if (renglonesVenta.length > 0) handlePonerEnEspera();
      } else if (e.key === "F12") {
        e.preventDefault();
        if (renglonesVenta.length > 0 && !modalCobroAbierto) handleAbrirCobro();
      } else if (e.key === "Escape") {
        if (pinEmergenciaAbierto) setPinEmergenciaAbierto(false);
        else if (modalAutorizacionAbierto) setModalAutorizacionAbierto(false);
        else if (modalConfigPagoMovilAbierto) setModalConfigPagoMovilAbierto(false);
        else if (modalTicketAbierto) setModalTicketAbierto(false);
        else if (modalCobroAbierto) setModalCobroAbierto(false);
        else if (modalEsperaAbierto) setModalEsperaAbierto(false);
        else if (modalTurnoAbierto) setModalTurnoAbierto(false);
        else if (ticketMovilAbierto) setTicketMovilAbierto(false);
        else if (busquedaProducto) setBusquedaProducto("");
        else handleSalirTerminal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const panelTicket = (
    <>

          {/* A) Cabecera del ticket */}
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <div>
              <h2 className="text-sm font-black text-slate-900">Ticket en Curso</h2>
              <span className="text-[11px] font-mono font-bold text-[#FE6712]">{numeroTicketActual}</span>
            </div>
            <button
              type="button"
              onClick={handleLimpiarTicket}
              className="px-3 py-1.5 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Limpiar Ticket
            </button>
          </div>

          {/* B) Lista de artículos */}
          <div className="flex-1 min-h-[12rem] md:min-h-0 overflow-y-auto">
            {renglonesVenta.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-[11px] text-slate-400">Escanee un código de barras o seleccione un producto para iniciar el ticket.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {renglonesVenta.map((r) => (
                  <li key={r.tempId} className="px-4 py-2.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 block leading-snug">{r.nombre}</span>
                        <span className="text-[10px] font-mono text-slate-400">{r.codigo} · ${r.precioUnitario.toFixed(2)} c/u</span>
                        {(r.variante || r.toppings.length > 0) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {r.variante && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[9px] font-bold">{r.variante}</span>}
                            {r.toppings.map((t) => (
                              <span key={t.id} className="px-1.5 py-0.5 rounded bg-orange-50 text-[#FE6712] text-[9px] font-bold">{t.nombre}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={() => handleEliminarRenglon(r.tempId)} title="Quitar" className="p-1 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => handleDecrementarRenglon(r.tempId)} className="w-6 h-6 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-bold">−</button>
                        <input
                          type="number"
                          min="1"
                          value={r.cantidad}
                          onChange={(e) => handleActualizarCantidadRenglon(r.tempId, e.target.value)}
                          className="w-11 text-center px-1 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono font-bold"
                        />
                        <button type="button" onClick={() => handleIncrementarRenglon(r.tempId)} className="w-6 h-6 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-bold">+</button>
                      </div>
                      <div className="text-right">
                        <span className="font-black font-mono text-slate-900 block text-sm">${r.subtotal.toFixed(2)}</span>
                        <span className="text-[10px] font-mono text-slate-400">Bs. {formatearBs(r.subtotal, tasaBcv)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* C) Desglose fiscal SENIAT */}
          <div className="px-4 py-3 border-t border-slate-200 space-y-1 text-[11px] shrink-0">
            {[
              ["Subtotal Bruto", subtotalBrutoUsd],
              ["Ventas Exentas", 0],
              ["Base Imponible 16%", baseImponibleUsd],
              ["IVA 16%", ivaUsd],
            ].map(([etiqueta, monto]) => (
              <div key={etiqueta} className="flex items-center justify-between text-slate-500">
                <span className="font-semibold">{etiqueta}</span>
                <span className="font-mono">
                  <span className="text-slate-800 font-bold">${monto.toFixed(2)}</span>
                  <span className="text-slate-400 ml-2">Bs. {formatearBs(monto, tasaBcv)}</span>
                </span>
              </div>
            ))}
          </div>

          {/* D) Totalizador bimonetario */}
          <div className="mx-4 mb-3 rounded-2xl border border-orange-200 bg-orange-50/40 px-4 py-3 shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total a Pagar</span>
            <div className="text-3xl font-black font-mono text-slate-900">${totalFacturaUsd.toFixed(2)}</div>
            <div className="text-lg font-bold font-mono text-orange-600">Bs. {formatearBs(totalFacturaUsd, tasaBcv)}</div>
          </div>

          {/* E) Acciones de pie */}
          <div className="px-4 pb-4 flex items-stretch gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePonerEnEspera}
              disabled={renglonesVenta.length === 0}
              title="Pausar esta venta y liberar el mostrador"
              className="px-4 py-3 bg-white hover:bg-amber-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 whitespace-nowrap"
            >
              <PauseCircle className="w-4 h-4" /> Retener [F8]
            </button>
            <button
              type="button"
              onClick={handleAbrirCobro}
              disabled={renglonesVenta.length === 0 || !formVenta.numeroDocumento.trim() || !formVenta.cliente.trim()}
              className="flex-1 px-4 py-3.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-sm font-black transition flex items-center justify-center gap-2 shadow-sm shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
            >
              <CreditCard className="w-4 h-4" /> COBRAR Y FACTURAR [F12]
            </button>
          </div>
    </>
  );

  const itemsEnTicket = renglonesVenta.reduce((acc, r) => acc + r.cantidad, 0);
  const ultimoRenglon = renglonesVenta[renglonesVenta.length - 1] || null;
  const esClienteNuevo =
    formVenta.numeroDocumento.trim().length >= 5 &&
    formVenta.numeroDocumento.trim() !== "00000000" &&
    !clienteCoincidenteActual &&
    !documentoBloqueado;

  const pillClase = (activo) =>
    `px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
      activo ? "bg-[#FE6712] text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200 hover:border-[#FE6712] hover:text-[#FE6712]"
    }`;

  return (
    <>
    {/* Overlay flotante centrado de la Terminal POS */}
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
    <div className="w-full max-w-[98vw] xl:max-w-[1600px] h-[95vh] bg-white text-slate-800 font-sans rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden relative animate-in fade-in zoom-in-95 duration-150">

      {/* ===== 1. BARRA SUPERIOR DE ESTADO ===== */}
      <header className="border-b border-slate-200 bg-white shrink-0">
        <div className="px-3 lg:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-2 md:grid md:grid-cols-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 md:flex-none">
            <button
              type="button"
              onClick={handleSalirTerminal}
              title="Salir de la caja [Esc]"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-300 rounded-lg text-[11px] font-black transition whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Salir de Caja / Volver
            </button>
            <Image
              src="/duna-pos.png"
              alt="D'una POS"
              width={112}
              height={28}
              priority
              className="h-7 w-auto object-contain shrink-0"
            />
            <span className="hidden xl:inline-flex px-2.5 py-1 rounded-full bg-orange-50 text-[#FE6712] border border-orange-200 text-[11px] font-bold whitespace-nowrap">
              Terminal Principal - Farma D&apos;una Virtual
            </span>
          </div>

          <div className="flex md:justify-center">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-700">
              <span className="text-slate-400">Tasa Oficial:</span>
              <span className="font-mono text-slate-900">Bs. {(tasaOficial || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto md:ml-0 md:justify-end">
            <span className="text-xs font-bold text-slate-700 truncate max-w-[10rem]">{usuario?.nombre || "Cajero"}</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap ${
              adonisConectado
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-rose-50 text-rose-700 border-rose-200"
            }`}>
              <span className={`w-2 h-2 rounded-full ${adonisConectado ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              {adonisConectado ? "Adonis Core Conectado" : "Adonis Core Sin Conexión"}
            </span>
          </div>
        </div>

        {/* Herramientas de mostrador: turno/arqueo, ventas en espera y reimpresión */}
        <div className="px-3 lg:px-6 py-1.5 border-t border-slate-100 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            {turnoActivo ? (
              <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap">
                <Wallet className="w-3.5 h-3.5" />
                Turno {turnoActivo.id} — ABIERTO · <span className="font-mono">{turnoActivo.ventasIds.length}</span> venta(s)
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 font-semibold whitespace-nowrap">Sin turno de caja abierto</span>
            )}
            {turnoActivo ? (
              <button onClick={handleCerrarTurno} className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-[11px] font-bold transition whitespace-nowrap">
                Cerrar Turno / Arqueo
              </button>
            ) : (
              <button onClick={() => setModalTurnoAbierto(true)} className="px-2.5 py-1 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-lg text-[11px] font-bold transition whitespace-nowrap">
                Abrir Turno de Caja
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setModalEsperaAbierto(true)}
              disabled={ventasEnEspera.length === 0}
              title="Ver ventas en espera (retener la venta actual: F8)"
              className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[11px] font-bold transition disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
            >
              ⏸ En Espera [F8] (<span className="font-mono">{ventasEnEspera.length}</span>)
            </button>
            <button type="button" onClick={() => abrirTicket()} className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold transition whitespace-nowrap">
              Reimprimir Ticket
            </button>
          </div>
        </div>
      </header>

      {/* ===== LAYOUT DUAL 65% / 35% ===== */}
      <main className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">

        {/* ---------- PANEL IZQUIERDO (65%) ---------- */}
        <section className="flex-1 md:flex-none md:w-[65%] min-h-0 flex flex-col h-full overflow-hidden p-3 lg:p-5">

          {/* Cabecera operativa fija: fiscal SENIAT, buscador [F2] y chips de categoría (nunca se desplaza) */}
          <div className="shrink-0 bg-white pb-2 space-y-2">

          {/* Banner de Recuperación de Borrador (crash recovery) */}
          {draftDetectado && (
            <div className="w-full rounded-2xl border border-amber-300 bg-amber-50 p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <p className="text-[11px] font-bold text-slate-700 min-w-0">
                  ⚠️ Venta en curso no finalizada para{" "}
                  <span className="text-slate-900">{draftDetectado.cliente?.nombre || "Consumidor Final"}</span>
                  {" "}({(draftDetectado.renglonesVenta || []).length} ítem{(draftDetectado.renglonesVenta || []).length === 1 ? "" : "s"} - <span className="font-mono">${totalBorrador.toFixed(2)}</span>).
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={handleRetomarBorrador} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition">
                  🔄 Retomar
                </button>
                <button type="button" onClick={handleDescartarBorrador} className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-[11px] font-bold transition">
                  🗑️ Descartar
                </button>
              </div>
            </div>
          )}

          {/* A) Cabecera Fiscal SENIAT (en móvil se despliega con el resumen del cliente) */}
          <button
            type="button"
            onClick={() => setFiscalMovilAbierto(v => !v)}
            className="md:hidden w-full flex items-center justify-between gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-left"
          >
            <span className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block">Cliente / Documento fiscal</span>
              <span className="text-xs font-bold text-slate-800 truncate block">
                {formVenta.cliente ? `${formVenta.cliente} · ${formVenta.tipoDocumento}${formVenta.numeroDocumento}` : "Sin cliente asignado"}
              </span>
            </span>
            <span className="text-[11px] font-bold text-[#FE6712] shrink-0">{fiscalMovilAbierto ? "Ocultar" : "Editar"}</span>
          </button>
          <div className={`${fiscalMovilAbierto ? "" : "hidden"} md:block bg-white border border-slate-200 rounded-2xl p-4 space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {TIPOS_DOCUMENTO_VENTA.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTipoDocumentoVenta(t.id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
                      tipoDocumentoVenta === t.id
                        ? "bg-[#FE6712] text-white border-[#FE6712]"
                        : "bg-white text-slate-500 border-slate-200 hover:border-[#FE6712] hover:text-[#FE6712]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleConsumidorFinal}
                className="px-3 py-1.5 bg-white hover:bg-orange-50 text-[#FE6712] border border-orange-200 rounded-lg text-[11px] font-bold transition"
              >
                Consumidor Final
              </button>
            </div>

            <div className="flex flex-wrap items-stretch gap-2">
              {/* Selector Fiscal + Documento */}
              <div className="relative shrink-0">
                <div
                  className={`flex items-stretch border rounded-lg overflow-hidden ${
                    errorDocumento
                      ? "bg-rose-50 border-rose-400"
                      : clienteCoincidenteActual || documentoBloqueado
                      ? "bg-emerald-50 border-emerald-300"
                      : "bg-white border-slate-200"
                  } focus-within:border-[#FE6712]`}
                >
                  <select
                    value={formVenta.tipoDocumento || "V-"}
                    onChange={(e) => setFormVenta({ ...formVenta, tipoDocumento: e.target.value })}
                    className="bg-slate-50 border-r border-slate-200 text-xs font-bold font-mono text-slate-700 pl-2 pr-1 rounded-l-lg focus:outline-none cursor-pointer"
                    title="Tipo de documento fiscal"
                  >
                    <option value="V-">V</option>
                    <option value="J-">J</option>
                    <option value="E-">E</option>
                    <option value="G-">G</option>
                    <option value="P-">P</option>
                  </select>
                  <input
                    ref={inputDocumentoRef}
                    type="text"
                    inputMode="numeric"
                    readOnly={documentoBloqueado}
                    value={formVenta.numeroDocumento}
                    onChange={(e) => handleCambiarNumeroDocumento(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        inputProductoRef.current?.focus();
                      }
                    }}
                    onFocus={() => setCampoActivoSugerencia("documento")}
                    onBlur={() => setTimeout(() => setCampoActivoSugerencia(null), 150)}
                    placeholder="Cédula/RIF"
                    autoComplete="off"
                    className={`w-32 bg-transparent pr-6 pl-2.5 py-1.5 text-xs font-mono font-medium placeholder:text-slate-400 focus:outline-none ${
                      documentoBloqueado ? "cursor-not-allowed" : ""
                    }`}
                  />
                </div>
                {documentoBloqueado && (
                  <button
                    type="button"
                    onClick={handleDesbloquearDocumento}
                    title="Cambiar cliente"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FE6712]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                {campoActivoSugerencia === "documento" && filtrarClientes(formVenta.numeroDocumento).length > 0 && (
                  <div className="absolute z-20 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {filtrarClientes(formVenta.numeroDocumento).map((cl, i) => (
                      <button key={i} type="button" onMouseDown={() => handleSeleccionarCliente(cl)} className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-100 last:border-0">
                        <span className="font-bold text-slate-800 block text-xs">{cl.nombre}</span>
                        <span className="text-[10px] font-mono text-slate-400">{cl.documento || "Sin documento"} • {cl.codigoPais}{cl.telefono}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Nombre / Razón Social */}
              <div className="relative flex-1 min-w-[160px]">
                <input
                  type="text"
                  value={formVenta.cliente}
                  onChange={(e) => setFormVenta({ ...formVenta, cliente: e.target.value })}
                  onFocus={() => setCampoActivoSugerencia("cliente")}
                  onBlur={() => setTimeout(() => setCampoActivoSugerencia(null), 150)}
                  placeholder="Nombre / Razón Social"
                  autoComplete="off"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#FE6712]"
                />
                {campoActivoSugerencia === "cliente" && filtrarClientes(formVenta.cliente).length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {filtrarClientes(formVenta.cliente).map((cl, i) => (
                      <button key={i} type="button" onMouseDown={() => handleSeleccionarCliente(cl)} className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-100 last:border-0">
                        <span className="font-bold text-slate-800 block text-xs">{cl.nombre}</span>
                        <span className="text-[10px] font-mono text-slate-400">{cl.documento || "Sin documento"} • {cl.codigoPais}{cl.telefono}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Teléfono con Código de País */}
              <div className="flex items-stretch bg-white border border-slate-200 rounded-lg overflow-hidden focus-within:border-[#FE6712] shrink-0">
                <select
                  value={formVenta.paisCodigo || "+58"}
                  onChange={(e) => setFormVenta({ ...formVenta, paisCodigo: e.target.value })}
                  className="bg-slate-50 border-r border-slate-200 text-xs font-bold font-mono text-slate-700 pl-2 pr-1 rounded-l-lg focus:outline-none cursor-pointer"
                  title="Código de país"
                >
                  <option value="+58">+58</option>
                  <option value="+57">+57</option>
                  <option value="+1">+1</option>
                  <option value="+34">+34</option>
                  <option value="+51">+51</option>
                  <option value="+52">+52</option>
                  <option value="+54">+54</option>
                  <option value="+56">+56</option>
                  <option value="+593">+593</option>
                </select>
                <input
                  type="tel"
                  value={formVenta.telefono}
                  onChange={(e) => setFormVenta({ ...formVenta, telefono: e.target.value })}
                  placeholder="Teléfono / WhatsApp"
                  autoComplete="off"
                  className="w-32 bg-transparent px-2.5 py-1.5 text-xs font-mono placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Dirección Fiscal */}
            <input
              type="text"
              value={formVenta.direccion}
              onChange={(e) => setFormVenta({ ...formVenta, direccion: e.target.value })}
              placeholder="📍 Dirección / Domicilio Fiscal del Cliente (Obligatorio)..."
              autoComplete="off"
              className="w-full text-xs py-1.5 px-3 rounded-lg border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:border-[#FE6712]"
            />

            {esClienteNuevo && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Nuevo Cliente — se registrará al procesar la venta
              </span>
            )}
            {errorDocumento && (
              <p className="text-[10px] text-rose-600 font-bold">La Cédula o RIF es obligatoria para emitir la factura.</p>
            )}
            {avisoClienteEnEspera && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-sky-700">
                <span>💡 Este cliente tiene un ticket en espera de <span className="font-mono">${avisoClienteEnEspera.total.toFixed(2)}</span>. ¿Deseas retomarlo?</span>
                <button
                  type="button"
                  onClick={() => handleRetomarVentaEnEspera(avisoClienteEnEspera)}
                  className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[10px] font-black transition shrink-0"
                >
                  Sí, retomar
                </button>
              </div>
            )}
          </div>

          {/* B) Búsqueda y filtros de catálogo */}
          <div className="space-y-2.5">
            <div className="relative">
              <ScanBarcode className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#FE6712]" />
              <input
                ref={inputProductoRef}
                type="text"
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                onKeyDown={handleBusquedaProductoKeyDown}
                placeholder="Escanear código de barras o buscar producto [F2]..."
                autoComplete="off"
                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#FE6712] focus:ring-2 focus:ring-orange-100 transition"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {["TODAS", ...categoriasCatalogo].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoriaActiva(cat)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap transition ${
                    categoriaActiva === cat
                      ? "bg-[#FE6712] text-white border-[#FE6712]"
                      : "bg-white text-slate-500 border-slate-200 hover:border-[#FE6712] hover:text-[#FE6712]"
                  }`}
                >
                  {cat === "TODAS" ? "Todas" : cat}
                </button>
              ))}
            </div>

            {busquedaProducto && soloAgotadosEnBusqueda && (
              <p className="text-[11px] font-bold text-slate-500">Sin existencias disponibles en tienda</p>
            )}
          </div>

          </div>

          {/* C) Grilla de productos: única zona con scroll vertical */}
          <div className="flex-1 overflow-y-auto pr-1 pb-4 min-h-0 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
          {productosInventario.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs font-semibold text-slate-400">
              {adonisConectado ? "Cargando catálogo desde Adonis..." : "No se pudo cargar el catálogo de Adonis."}
            </div>
          ) : productosGrilla.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs font-semibold text-slate-400">
              No hay productos que coincidan con la búsqueda.
            </div>
          ) : (
            <div className="min-w-0">
              {/* Cabecera de columnas fija dentro del área con scroll */}
              <div className="sticky top-0 z-10 bg-white border-b border-slate-200 grid grid-cols-[44px_1fr_84px_60px] xl:grid-cols-[48px_1fr_120px_120px_90px_110px_72px] gap-3 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <span>Foto</span>
                <span>Nombre y presentación</span>
                <span className="hidden xl:block">Código/SKU</span>
                <span className="hidden xl:block">Categoría</span>
                <span className="text-right">Precio USD</span>
                <span className="hidden xl:block text-right">Precio Bs.</span>
                <span className="text-center">Stock</span>
              </div>

              {productosGrilla.map((p) => {
                const agotado = !tieneExistencias(p);
                const stockNum = Number(p.stock) || 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={agotado}
                    onClick={() => handleAgregarProductoDirecto(p)}
                    className={`w-full text-left grid grid-cols-[44px_1fr_84px_60px] xl:grid-cols-[48px_1fr_120px_120px_90px_110px_72px] gap-3 px-3 py-2 items-center border-b border-slate-100 transition ${
                      agotado ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50 cursor-pointer focus:outline-none focus:bg-orange-50"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- miniatura remota de dominios variables, incompatible con next/image sin configurar */}
                    <img
                      src={p.image || undefined}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover bg-slate-50 border border-slate-200"
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 leading-snug block">{p.name}</span>
                      <span className="xl:hidden text-[10px] font-mono text-slate-400 block">{p.code}</span>
                    </div>
                    <span className="hidden xl:block text-[11px] font-mono text-slate-400 truncate">{p.code}</span>
                    <span className="hidden xl:block text-[11px] text-slate-500 truncate">{p.categoria || "—"}</span>
                    <span className="text-right text-sm font-black font-mono text-slate-900">${p.price.toFixed(2)}</span>
                    <span className="hidden xl:block text-right text-[11px] font-mono text-slate-400">Bs. {formatearBs(p.price, tasaBcv)}</span>
                    <span
                      className={`justify-self-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                        agotado
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : stockNum > 3
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-orange-50 text-orange-700 border-orange-200"
                      }`}
                    >
                      {agotado ? "0" : p.stock}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          </div>
        </section>

        {/* ---------- PANEL DERECHO (35%): Ticket lateral ---------- */}
        <aside className="hidden md:flex md:w-[35%] bg-white border-l border-slate-200 flex-col min-h-0">
          {panelTicket}
        </aside>
      </main>

      {/* Barra flotante inferior (móvil/tablet): resumen del ticket y acceso al cobro */}
      <div className="md:hidden shrink-0 border-t border-slate-200 bg-white px-3 py-2 flex items-center gap-3 cursor-pointer" onClick={() => setTicketMovilAbierto(true)}>
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block">
            <span className="font-mono">{itemsEnTicket}</span> ítem{itemsEnTicket === 1 ? "" : "s"} en el ticket
          </span>
          {ultimoRenglon && (
            <span className="text-[11px] text-slate-500 truncate block">
              Último: <span className="font-bold text-slate-700">{ultimoRenglon.nombre}</span>
            </span>
          )}
          <span className="text-lg font-black font-mono text-slate-900 leading-none">${totalFacturaUsd.toFixed(2)}</span>
          <span className="text-[11px] font-mono text-orange-600 ml-2">Bs. {formatearBs(totalFacturaUsd, tasaBcv)}</span>
        </div>
        <button
          type="button"
          onClick={() => setTicketMovilAbierto(true)}
          className="px-4 py-3 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-sm font-black transition flex items-center gap-2 shadow-sm shadow-orange-500/20 whitespace-nowrap"
        >
          <CreditCard className="w-4 h-4" /> Ver Ticket / Cobrar
        </button>
      </div>

      {/* Bottom sheet del ticket fiscal (móvil/tablet) */}
      {ticketMovilAbierto && (
        <div className="md:hidden absolute inset-0 z-30 bg-slate-100/70 flex flex-col justify-end" onClick={() => setTicketMovilAbierto(false)}>
          <div
            className="bg-white rounded-t-2xl border-t border-slate-200 shadow-2xl h-[88%] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-100">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Ticket fiscal</span>
              <button type="button" onClick={() => setTicketMovilAbierto(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition" title="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {panelTicket}
            </div>
          </div>
        </div>
      )}
    </div>
    </div>

      {/* Modal de Cobro / Medios de Pago */}
      {modalCobroAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-3 sm:space-y-5 max-h-[95vh] overflow-y-auto">

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Cobrar / Finalizar Venta</h3>
                <p className="text-xs text-slate-400">{formVenta.cliente || "Consumidor Final"} • Total ${totalFacturaUsd.toFixed(2)}</p>
              </div>
              <button onClick={() => setModalCobroAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCrearVenta} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Condición de Venta</label>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setFormVenta({ ...formVenta, condicionVenta: "CONTADO" })} className={pillClase(formVenta.condicionVenta === "CONTADO")}>Solo Contado</button>
                  <button type="button" onClick={() => setFormVenta({ ...formVenta, condicionVenta: "CREDITO" })} className={pillClase(formVenta.condicionVenta === "CREDITO")}>Permite Crédito</button>
                </div>
              </div>

              {requiereAutorizacionSupervisor && (
                autorizacionCredito ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center gap-2 text-[11px] font-bold text-emerald-700">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Autorizado por {autorizacionCredito.supervisorNombre} · {autorizacionCredito.horaAutorizacion}</span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2 text-[11px] font-bold text-amber-700">
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>Esta venta a crédito requiere autorización de un supervisor antes de registrarse.</span>
                  </div>
                )
              )}

              {formVenta.condicionVenta === "CONTADO" ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-emerald-700">Venta de Contado: se cobra el 100% al momento.</p>
                  <p className="text-base font-black font-mono text-emerald-800 shrink-0">${totalFacturaUsd.toFixed(2)}</p>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Abono Inicial</label>
                  <div className="flex items-center gap-1.5 mb-2">
                    <button type="button" onClick={() => setFormVenta({ ...formVenta, monedaAbono: "usd" })} className={pillClase(formVenta.monedaAbono === "usd")}>$ USD</button>
                    <button type="button" onClick={() => setFormVenta({ ...formVenta, monedaAbono: "ves" })} className={pillClase(formVenta.monedaAbono === "ves")}>Bs VES</button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={formVenta.montoAbonadoInput}
                    onChange={(e) => setFormVenta({ ...formVenta, montoAbonadoInput: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 focus:outline-none"
                  />
                  {Number(formVenta.montoAbonadoInput) > 0 && (
                    <p className="text-[11px] text-emerald-600 font-bold mt-1.5">
                      {formVenta.monedaAbono === "ves"
                        ? `≈ $${montoAbonadoUsd.toFixed(2)} USD`
                        : `≈ Bs. ${formatearBs(montoAbonadoUsd, tasaBcv)}`}
                    </p>
                  )}
                </div>
              )}

              {(Number(formVenta.montoAbonadoInput) > 0 || formVenta.condicionVenta === "CONTADO") && (
                <div className="space-y-3 pt-3 border-t border-dashed border-slate-200">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1 flex items-center justify-between">
                      <span>Método de Pago</span>
                      <button type="button" onClick={abrirModalConfigPagoMovil} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-[#FE6712] transition">
                        <Settings className="w-3 h-3" /> Configurar datos de cobro
                      </button>
                    </label>
                    <select
                      value={formVenta.metodoPago}
                      onChange={(e) => setFormVenta({ ...formVenta, metodoPago: e.target.value, montoRecibido: "" })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                    >
                      {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  {(esEfectivoUsd || esEfectivoBs) && montoACobrarUsd > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                        <span>Monto a cobrar</span>
                        <span className="text-slate-900">
                          {esEfectivoBs ? `Bs. ${montoACobrarMoneda.toFixed(2)}` : `$${montoACobrarMoneda.toFixed(2)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formVenta.montoRecibido}
                          onChange={(e) => setFormVenta({ ...formVenta, montoRecibido: e.target.value })}
                          placeholder={esEfectivoBs ? "Monto recibido (Bs.)" : "Monto recibido ($)"}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]"
                        />
                        <button
                          type="button"
                          onClick={() => setFormVenta({ ...formVenta, montoRecibido: montoACobrarMoneda.toFixed(2) })}
                          className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-[11px] font-bold transition shrink-0"
                        >
                          Monto exacto
                        </button>
                      </div>
                      {montoRecibidoNum > 0 && (
                        efectivoInsuficiente ? (
                          <p className="text-[11px] font-bold text-rose-600">
                            Faltan {esEfectivoBs ? `Bs. ${faltanteEfectivo.toFixed(2)}` : `$${faltanteEfectivo.toFixed(2)}`}
                          </p>
                        ) : (
                          <p className="text-[11px] font-black text-emerald-700">
                            Vuelto: {esEfectivoBs ? `Bs. ${vueltoEfectivo.toFixed(2)}` : `$${vueltoEfectivo.toFixed(2)}`}
                            <span className="font-bold text-emerald-600 ml-1.5">
                              (≈ {esEfectivoBs ? `$${(vueltoEfectivo / (tasaBcv || 1)).toFixed(2)}` : `Bs. ${formatearBs(vueltoEfectivo, tasaBcv)}`})
                            </span>
                          </p>
                        )
                      )}
                    </div>
                  )}
                  {requiereDatosTransferenciaVenta && formVenta.metodoPago !== "Pago Móvil" && (
                    <div className="grid grid-cols-2 gap-3">
                      <select value={formVenta.bancoEmisor} onChange={(e) => setFormVenta({ ...formVenta, bancoEmisor: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                        <option value="">Banco emisor...</option>
                        {bancosVenezuela.map(b => <option key={b.codigo} value={b.codigo}>{b.display}</option>)}
                      </select>
                      <select value={formVenta.bancoReceptor} onChange={(e) => setFormVenta({ ...formVenta, bancoReceptor: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                        <option value="">Banco receptor...</option>
                        {bancosVenezuela.map(b => <option key={b.codigo} value={b.codigo}>{b.display}</option>)}
                      </select>
                      <div className="col-span-2">
                        <input
                          type="text"
                          required
                          value={formVenta.referencia}
                          onChange={(e) => setFormVenta({ ...formVenta, referencia: e.target.value })}
                          placeholder="N° de referencia *"
                          className={`w-full px-3 py-2 border rounded-xl text-xs focus:outline-none ${
                            referenciaVentaDuplicada ? "bg-rose-50 border-rose-400" : "bg-slate-50 border-slate-200 focus:border-[#FE6712]"
                          }`}
                        />
                        {referenciaVentaDuplicada && (
                          <p className="text-[10px] text-rose-600 font-bold mt-1">Esta referencia ya fue registrada anteriormente.</p>
                        )}
                      </div>
                      <input type="text" value={formVenta.titular} onChange={(e) => setFormVenta({ ...formVenta, titular: e.target.value })} placeholder="Teléfono / Titular" className="col-span-2 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                    </div>
                  )}
                  {formVenta.metodoPago === "Pago Móvil" && (
                    <div className="space-y-2">
                      <div className="rounded-xl border border-orange-200 bg-orange-50/40 px-3 py-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total a Pagar</span>
                        <span className="text-right">
                          <span className="text-xl font-black font-mono text-slate-900">Bs. {formatearBs(montoPagoMovilUsd, tasaBcv)}</span>
                          <span className="text-[11px] font-mono text-slate-400 ml-2">≈ ${montoPagoMovilUsd.toFixed(2)}</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Datos para tu Pago Móvil</h4>
                        <button
                          type="button"
                          onClick={handleCopiarDatosPagoMovil}
                          className="shrink-0 px-2.5 py-1 rounded-full bg-orange-50 hover:bg-[#FE6712] text-[#FE6712] hover:text-white border border-orange-200 text-[10px] font-black transition whitespace-nowrap"
                        >
                          {copiadoDatosPagoMovil ? "✓ ¡Copiado!" : "📋 Copiar Todo"}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                        {datosPagoMovil.map((d) => (
                          <div key={d.campo} className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white min-w-0">
                            <div className="min-w-0">
                              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 block">{d.etiqueta}</span>
                              <span className="text-xs font-bold font-mono text-slate-900 truncate block">{d.valor}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopiarCampoPagoMovil(d.valor, d.campo)}
                              title={`Copiar ${d.etiqueta}`}
                              className="shrink-0 w-6 h-6 rounded-md bg-orange-50 hover:bg-[#FE6712] text-[#FE6712] hover:text-white flex items-center justify-center transition border border-orange-200"
                            >
                              {campoCopiadoPM === d.campo ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        ))}
                      </div>

                      <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500 pt-1">Reporta tu pago</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          value={formVenta.referencia}
                          onChange={(e) => setFormVenta({ ...formVenta, referencia: e.target.value })}
                          placeholder="N° de referencia *"
                          className={`w-full px-2.5 py-2 border rounded-xl text-xs font-mono focus:outline-none ${
                            referenciaVentaDuplicada ? "bg-rose-50 border-rose-400" : "bg-white border-slate-200 focus:border-[#FE6712]"
                          }`}
                        />
                        <select
                          value={formVenta.bancoEmisor}
                          onChange={(e) => setFormVenta({ ...formVenta, bancoEmisor: e.target.value })}
                          className="w-full px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#FE6712]"
                        >
                          <option value="">Banco emisor...</option>
                          {bancosVenezuela.map(b => <option key={b.codigo} value={b.codigo}>{b.display}</option>)}
                        </select>
                      </div>
                      {referenciaVentaDuplicada && (
                        <p className="text-[10px] text-rose-600 font-bold">Esta referencia ya fue registrada anteriormente.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="sticky bottom-0 bg-white flex items-center justify-end gap-2 pt-3 pb-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalCobroAbierto(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formVenta.numeroDocumento.trim().length < 5 || renglonesVenta.length === 0 || referenciaVentaDuplicada || efectivoInsuficiente}
                  title={
                    formVenta.numeroDocumento.trim().length < 5
                      ? "La Cédula o RIF es obligatoria para emitir la factura"
                      : renglonesVenta.length === 0
                      ? "Agrega al menos un producto al ticket"
                      : referenciaVentaDuplicada
                      ? "Esta referencia ya fue registrada anteriormente"
                      : efectivoInsuficiente
                      ? "El monto recibido no cubre el total a cobrar"
                      : undefined
                  }
                  className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${
                    requiereAutorizacionSupervisor && !autorizacionCredito
                      ? "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20 disabled:hover:bg-amber-600"
                      : "bg-[#FE6712] hover:bg-[#ea580c] shadow-orange-500/20 disabled:hover:bg-[#FE6712]"
                  }`}
                >
                  {requiereAutorizacionSupervisor && !autorizacionCredito ? (
                    <><Lock className="w-4 h-4" /> Solicitar Autorización</>
                  ) : (
                    <><Check className="w-4 h-4" /> Confirmar Pago</>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Modal de Autorización de Supervisor (QR dinámico) */}
      {modalAutorizacionAbierto && autorizacionActual && (
        <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Autorización de Supervisor Requerida</h3>
                <p className="text-[11px] text-slate-400">Venta a crédito por ${autorizacionActual.montoUsd.toFixed(2)} (Bs. {formatearBs(autorizacionActual.montoUsd, tasaBcv)})</p>
              </div>
              <button onClick={() => setModalAutorizacionAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {autorizacionActual.status === "APROBADA" ? (
              <div className="text-center space-y-3 py-2">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto animate-pulse">
                  <Check className="w-8 h-8" />
                </div>
                <h4 className="text-base font-black text-emerald-700">¡Autorización Aprobada!</h4>
                <p className="text-xs text-slate-500">
                  Por <span className="font-bold text-slate-800">{autorizacionActual.supervisorInfo?.supervisorNombre}</span>
                </p>
                <p className="text-[11px] text-slate-400">Continuando con el registro de la factura…</p>
              </div>
            ) : autorizacionActual.status === "RECHAZADA" ? (
              <div className="text-center space-y-3 py-2">
                <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                  <X className="w-8 h-8" />
                </div>
                <h4 className="text-base font-black text-rose-700">Autorización Rechazada</h4>
                <p className="text-xs text-slate-500">El supervisor rechazó esta venta a crédito desde su teléfono.</p>
                <div className="flex flex-col gap-2 pt-2">
                  <button type="button" onClick={abrirModalAutorizacion} className="w-full px-3 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-[11px] font-bold transition">
                    🔄 Solicitar de Nuevo
                  </button>
                  <button type="button" onClick={handlePausarPorAutorizacion} className="w-full px-3 py-2 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[11px] font-bold transition">
                    ⏸ Pausar y Mandar a Administración
                  </button>
                </div>
              </div>
            ) : autorizacionActual.status === "EXPIRADA" ? (
              <div className="text-center space-y-3 py-2">
                <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h4 className="text-base font-black text-amber-700">Código QR Expirado</h4>
                <p className="text-xs text-slate-500">El supervisor no escaneó el código a tiempo.</p>
                <div className="flex flex-col gap-2 pt-2">
                  <button type="button" onClick={abrirModalAutorizacion} className="w-full px-3 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-[11px] font-bold transition">
                    🔄 Regenerar QR
                  </button>
                  <button type="button" onClick={handlePausarPorAutorizacion} className="w-full px-3 py-2 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[11px] font-bold transition">
                    ⏸ Pausar y Mandar a Administración
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-center min-h-[180px]">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- imagen data URL generada en cliente por la librería qrcode, incompatible con next/image
                    <img src={qrDataUrl} alt="Código QR de autorización" className="w-44 h-44" />
                  ) : (
                    <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                  Pide al supervisor que escanee este código con su teléfono para aprobar la venta.
                </p>
                <div className="flex items-center justify-center gap-1.5 text-slate-700">
                  <QrCode className="w-4 h-4" />
                  <span className="text-2xl font-black tabular-nums">{segundosRestantes}s</span>
                </div>

                <button type="button" onClick={handlePausarPorAutorizacion} className="w-full px-3 py-2 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5">
                  <PauseCircle className="w-3.5 h-3.5" /> Pausar y Mandar a Administración
                </button>

                {pinEmergenciaAbierto ? (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pinEmergenciaInput}
                      onChange={(e) => setPinEmergenciaInput(e.target.value.replace(/\D/g, ""))}
                      placeholder="••••"
                      autoFocus
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-center tracking-[0.3em] text-slate-800 focus:outline-none focus:border-[#FE6712]"
                    />
                    <button type="button" onClick={handleValidarPinEmergencia} className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[11px] font-bold transition shrink-0">
                      Validar
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setPinEmergenciaAbierto(true)} className="w-full text-center text-[10px] text-slate-400 hover:text-slate-600 underline transition">
                    ¿Supervisor sin teléfono? Ingresar PIN manual (4 dígitos)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Abrir Turno de Caja */}
      {modalTurnoAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Abrir Turno de Caja</h3>
                <p className="text-xs text-slate-400">Registra el fondo inicial para comenzar a vender</p>
              </div>
              <button onClick={() => setModalTurnoAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAbrirTurno} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Monto Inicial ($)</label>
                  <input type="number" step="0.01" value={montoInicialUsd} onChange={(e) => setMontoInicialUsd(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Monto Inicial (Bs.)</label>
                  <input type="number" step="0.01" value={montoInicialBs} onChange={(e) => setMontoInicialBs(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalTurnoAbierto(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
                  <Check className="w-4 h-4" /> Abrir Turno
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Configurar Datos de Cobro (Pago Móvil) */}
      {modalConfigPagoMovilAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Datos de Cobro</h3>
                <p className="text-[11px] text-slate-400">Se guardan en este dispositivo para no re-escribirlos en cada venta</p>
              </div>
              <button onClick={() => setModalConfigPagoMovilAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Banco Receptor</label>
              <select
                value={formConfigPagoMovil.bancoReceptor}
                onChange={(e) => setFormConfigPagoMovil({ ...formConfigPagoMovil, bancoReceptor: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
              >
                <option value="">Seleccionar banco...</option>
                {bancosVenezuela.map(b => <option key={b.codigo} value={b.codigo}>{b.display}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Teléfono Receptor</label>
              <input
                type="tel"
                value={formConfigPagoMovil.telefonoReceptor}
                onChange={(e) => setFormConfigPagoMovil({ ...formConfigPagoMovil, telefonoReceptor: e.target.value })}
                placeholder="0412-1234567"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Cédula / RIF Receptor</label>
              <input
                type="text"
                value={formConfigPagoMovil.rifReceptor}
                onChange={(e) => setFormConfigPagoMovil({ ...formConfigPagoMovil, rifReceptor: e.target.value })}
                placeholder="J-12345678-0"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Nombre / Razón Social Titular</label>
              <input
                type="text"
                value={formConfigPagoMovil.nombreTitular}
                onChange={(e) => setFormConfigPagoMovil({ ...formConfigPagoMovil, nombreTitular: e.target.value })}
                placeholder="Mi Comercio C.A."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setModalConfigPagoMovilAbierto(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">
                Cancelar
              </button>
              <button type="button" onClick={handleGuardarConfigPagoMovil} className="px-5 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
                <Check className="w-4 h-4" /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ventas en Espera */}
      {modalEsperaAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Ventas en Espera</h3>
                <p className="text-xs text-slate-400">Tickets pausados listos para retomar en el mostrador</p>
              </div>
              <button onClick={() => setModalEsperaAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {ventasEnEspera.length === 0 ? (
              <div className="text-center py-10">
                <PauseCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No hay ventas en espera por el momento.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Cliente</th>
                      <th className="p-3">RIF</th>
                      <th className="p-3">Ítems</th>
                      <th className="p-3">Total</th>
                      <th className="p-3">Pausada</th>
                      <th className="p-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ventasEnEspera.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50/50 transition">
                        <td className="p-3 font-bold text-slate-800">{v.cliente?.nombre || "Consumidor Final"}</td>
                        <td className="p-3 text-slate-500">
                          {v.cliente?.tipoDocumento || ""}{v.cliente?.numeroDocumento || "—"}
                        </td>
                        <td className="p-3 text-slate-600">{(v.renglonesVenta || []).length}</td>
                        <td className="p-3 font-black text-slate-900">${v.total.toFixed(2)}</td>
                        <td className="p-3 text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <History className="w-3 h-3" /> {v.fechaHora}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRetomarVentaEnEspera(v)}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold text-[10px] transition"
                            >
                              Retomar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEliminarVentaEnEspera(v.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setModalEsperaAbierto(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    
      {/* MODAL IMPRESION TICKET TERMICO */}
      <TicketTermicoModal 
        isOpen={modalTicketAbierto} 
        onClose={() => setModalTicketAbierto(false)} 
        venta={datosUltimoTicket}
        empresa={{ nombre: "D'UNA MARKET", sede: "Sede Cabimas, Zulia", rif: "J-50123456-7", telefono: "0412-1234567" }}
      />
    </>
  );
}

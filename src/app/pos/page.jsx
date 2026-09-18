"use client";
import TicketTermicoModal from '@/components/TicketTermicoModal';
import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft, Search, Plus, Check, X,
  Trash2, MessageCircle, ShieldCheck, Wallet, Copy, Settings, Smartphone,
  AlertTriangle, PauseCircle, History, CreditCard, Lock, Loader2, QrCode,
  Printer
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
  "Tarjeta Débito/Crédito",
  "Zelle",
];

const METODOS_CON_REFERENCIA = ["Pago Móvil", "Transf. Mismo Banco", "Transf. Interbancaria"];

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

  const [cuentas, setCuentas] = useState([]);
  const [productosInventario, setProductosInventario] = useState([]);
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

  const [modalCobroAbierto, setModalCobroAbierto] = useState(false);
  const [modalAuditoriaAbierto, setModalAuditoriaAbierto] = useState(false);

  const [modalTurnoAbierto, setModalTurnoAbierto] = useState(false);
  const [montoInicialUsd, setMontoInicialUsd] = useState("");
  const [montoInicialBs, setMontoInicialBs] = useState("");

  const [configPagoMovil, setConfigPagoMovil] = useState(CONFIG_PAGOMOVIL_DEFECTO);
  const [modalConfigPagoMovilAbierto, setModalConfigPagoMovilAbierto] = useState(false);
  const [formConfigPagoMovil, setFormConfigPagoMovil] = useState(CONFIG_PAGOMOVIL_DEFECTO);
  const [copiadoDatosPagoMovil, setCopiadoDatosPagoMovil] = useState(false);

  const [pagoMovilActivo, setPagoMovilActivo] = useState(null);
  const [tokenPagoActivo, setTokenPagoActivo] = useState(null);
  const [modalComprobanteAbierto, setModalComprobanteAbierto] = useState(false);

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

    inputProductoRef.current?.focus();
  }, []);

  // Sincronización en tiempo real con Firestore (colección "duna_productos"); sin variables de entorno,
  // degrada suavemente a localStorage.
  useEffect(() => {
    return escucharColeccion("duna_productos", (items) => {
      // Limpieza: elimina cualquier remanente del antiguo catálogo semilla de demostración
      const semilla = items.filter((p) => String(p.id).startsWith("SEED-FAR-"));
      if (semilla.length > 0) {
        semilla.forEach((p) => {
          eliminarDocumento("duna_productos", p.id).catch((e) => console.error(e));
        });
        setProductosInventario(items.filter((p) => !String(p.id).startsWith("SEED-FAR-")));
        return;
      }
      setProductosInventario(items);
    });
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

  const actualizarProductosInventario = (nuevos) => {
    setProductosInventario(nuevos);
    nuevos.forEach((p) => {
      guardarDocumento("duna_productos", p.id, p).catch((e) => console.error(e));
    });
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

  // Auditoría reactiva de deuda: facturas pendientes del cliente detectado por cédula/RIF
  const facturasAdeudadasCliente = clienteCoincidenteActual
    ? cuentas.filter(c => extraerDigitos(c.documento) === extraerDigitos(clienteCoincidenteActual.documento) && c.saldo > 0)
    : [];
  const deudaTotalUsd = facturasAdeudadasCliente.reduce((acc, c) => acc + c.saldo, 0);
  const deudaTotalBs = deudaTotalUsd * tasaBcv;
  const cantidadFacturasPendientes = facturasAdeudadasCliente.length;

  const productoSeleccionado = productosInventario.find(p => p.id === itemActual.productoId) || null;
  const esGastronomiaConVariantes = productoSeleccionado?.nicho === "Gastronomía & Heladería" && (productoSeleccionado.variantes || []).length > 0;

  // Buscador predictivo limpio: si está vacío, no se muestra ningún catálogo previo
  const productosFiltradosCombo = (busquedaProducto
    ? productosInventario.filter(p =>
        p.name.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        p.code.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        (p.barcode || "").toLowerCase().includes(busquedaProducto.toLowerCase())
      )
    : []
  ).slice(0, 8);

  const handleSeleccionarProducto = (prod) => {
    setItemActual({ productoId: prod.id, varianteNombre: "", toppingsSeleccionadosIds: [], cantidad: 1 });
    setBusquedaProducto(`${prod.code} - ${prod.name}`);
    setMostrarSugerenciasProducto(false);
  };

  // Añade (o fusiona con un renglón existente idéntico) un producto al ticket de venta
  const agregarProductoAlTicket = (producto, varianteNombre, toppingsSeleccionados, cantidad) => {
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
    const match = productosInventario.find(p => p.barcode && p.barcode === busquedaProducto.trim()) ||
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

  const handleActualizarCantidadRenglon = (tempId, nuevaCantidad) => {
    const cant = Math.max(1, Number(nuevaCantidad) || 1);
    setRenglonesVenta(prev => prev.map(r => r.tempId === tempId ? { ...r, cantidad: cant, subtotal: r.precioUnitario * cant } : r));
  };

  const handleIncrementarRenglon = (tempId) => {
    setRenglonesVenta(prev => prev.map(r => r.tempId === tempId ? { ...r, cantidad: r.cantidad + 1, subtotal: r.precioUnitario * (r.cantidad + 1) } : r));
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

  // Datos y mensaje para el despacho de cobro por Pago Móvil vía WhatsApp
  const bancoReceptorSeleccionado = bancosVenezuela.find(b => b.codigo === formVenta.bancoReceptor) || null;
  const montoPagoMovilUsd = formVenta.condicionVenta === "CONTADO" ? totalFacturaUsd : montoAbonadoUsd;
  const mensajePagoMovil = `Hola *${formVenta.cliente || "cliente"}*, para completar tu compra realiza el Pago Móvil con estos datos:\n🏦 Banco: *${bancoReceptorSeleccionado ? bancoReceptorSeleccionado.display : "(configura el banco receptor)"}*\n📱 Teléfono: *${configPagoMovil.telefonoReceptor || "(sin configurar)"}*\n🆔 Cédula/RIF: *${configPagoMovil.rifReceptor || "(sin configurar)"}*\n👤 Titular: *${configPagoMovil.nombreTitular || "(sin configurar)"}*\n💰 Monto: *Bs. ${formatearBs(montoPagoMovilUsd, tasaBcv)}* (≈ $${montoPagoMovilUsd.toFixed(2)} USD)\n\nPor favor responde a este mensaje con la captura del comprobante o el número de referencia para emitir tu factura.`;

  const handleEnviarDatosPagoMovil = () => {
    const numero = `${(formVenta.paisCodigo || "+58").replace("+", "")}${limpiarTelefono(formVenta.telefono)}`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensajePagoMovil)}`, "_blank");
  };

  const handleCopiarDatosPagoMovil = async () => {
    try {
      await navigator.clipboard.writeText(mensajePagoMovil);
      setCopiadoDatosPagoMovil(true);
      setTimeout(() => setCopiadoDatosPagoMovil(false), 1500);
    } catch (e) {
      alert("No se pudo copiar automáticamente. Copia el mensaje manualmente.");
    }
  };

  // Crea la intención de pago con token y abre WhatsApp con el link de autoservicio
  const handleEnviarLinkPagoMovil = () => {
    const token = generarTokenPago();
    const nuevaIntencion = {
      id: token,
      token,
      fechaCreacion: new Date().toLocaleString("es-VE"),
      clienteNombre: formVenta.cliente,
      clienteTelefono: `${formVenta.paisCodigo}${limpiarTelefono(formVenta.telefono)}`,
      montoUsd: montoPagoMovilUsd,
      montoBs: montoPagoMovilUsd * tasaBcv,
      renglones: renglonesVenta,
      status: "PENDIENTE",
      referenciaReportada: "",
      imagenComprobante: null,
    };
    guardarDocumento("duna_pagos_pendientes", token, nuevaIntencion).catch((e) => console.error(e));
    setTokenPagoActivo(token);

    const link = `${obtenerOrigen()}/pago/${token}`;
    const numero = `${(formVenta.paisCodigo || "+58").replace("+", "")}${limpiarTelefono(formVenta.telefono)}`;
    const mensaje = `Hola *${formVenta.cliente || "cliente"}*, para completar tu compra realiza tu Pago Móvil desde este link seguro:\n${link}\n\n💰 Monto: *Bs. ${formatearBs(montoPagoMovilUsd, tasaBcv)}* (≈ $${montoPagoMovilUsd.toFixed(2)} USD)\n\nAl confirmar tu pago allí, tu factura queda lista para validarse en caja.`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
  };

  // Escucha reactiva (Firestore en vivo, o polling local): detecta si el cliente ya reportó el comprobante
  useEffect(() => {
    if (!tokenPagoActivo) return undefined;
    return escucharDocumento("duna_pagos_pendientes", tokenPagoActivo, (pago) => {
      setPagoMovilActivo(pago);
      if (pago && pago.status === "REPORTADO") {
        setFormVenta(prev => ({ ...prev, referencia: pago.referenciaReportada || prev.referencia }));
      }
    }, 2000);
  }, [tokenPagoActivo]);

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

    // Descontar inventario de CADA renglón del ticket (con soporte de variantes/sabores)
    let productosActualizados = [...productosInventario];
    renglonesVenta.forEach(r => {
      productosActualizados = productosActualizados.map(p => {
        if (p.id !== r.productoId) return p;
        if (r.variante && (p.variantes || []).length > 0) {
          const nuevasVariantes = (p.variantes || []).map(v =>
            v.nombre === r.variante
              ? { ...v, stock: Math.max(0, (Number(v.stock) || 0) - r.cantidad) }
              : v
          );
          const nuevoStock = nuevasVariantes.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
          return { ...p, variantes: nuevasVariantes, stock: nuevoStock };
        }
        return { ...p, stock: Math.max(0, p.stock - r.cantidad) };
      });
    });
    actualizarProductosInventario(productosActualizados);

    // Escudo anti-duplicados: upsert por cédula/RIF normalizada (clave única)
    const clienteExistente = documentoFinal
      ? clientes.find(c => normalizarDocumento(c.documento) === documentoFinal)
      : clientes.find(c => !c.documento && c.nombre.toLowerCase() === formVenta.cliente.toLowerCase());
    const clienteActualizado = {
      id: clienteExistente?.id || `cli_${Date.now()}`,
      documento: documentoFinal,
      nombre: formVenta.cliente,
      codigoPais: formVenta.paisCodigo,
      telefono: formVenta.telefono || "",
      direccion: formVenta.direccion || "",
      sucursalId: usuario?.sucursalId || "",
      condicionVenta: formVenta.condicionVenta,
      limiteCredito: clienteExistente?.limiteCredito || 0,
    };
    if (clienteExistente) {
      actualizarClientes(clientes.map(c => c === clienteExistente ? clienteActualizado : c), clienteActualizado);
    } else {
      actualizarClientes([clienteActualizado, ...clientes], clienteActualizado);
    }

    // Adjuntar la venta al turno de caja activo
    if (turnoActivo) {
      actualizarTurnos(turnos.map(t =>
        t.id === turnoActivo.id ? { ...t, ventasIds: [...t.ventasIds, nuevaCuenta.id] } : t
      ));
    }

    actualizarCuentas([nuevaCuenta, ...cuentas]);
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
    setModalAuditoriaAbierto(false);
    setTokenPagoActivo(null);
    setAvisoClienteEnEspera(null);
    // Venta formalizada: el borrador de recuperación ya no aplica
    localStorage.removeItem("duna_pos_draft");
    setDraftDetectado(null);
    setNumeroTicketActual(`FAC-${Date.now().toString().slice(-6)}`);
    inputProductoRef.current?.focus();
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

  // Confirmación de venta directa de alta velocidad con apertura de ticket térmico
  const handleConfirmarVentaDirecta = () => {
    if (!formVenta.numeroDocumento.trim() || !formVenta.cliente.trim()) {
      setErrorDocumento(true);
      alert("Debe ingresar la Cédula/RIF del cliente para facturar");
      return;
    }
    if (renglonesVenta.length === 0) {
      alert("Agrega al menos un producto al ticket antes de confirmar la venta.");
      return;
    }

    const clienteNombre = formVenta.cliente.trim() || "Consumidor Final";
    const docNumero = formVenta.numeroDocumento.trim() || "00000000";
    const docTipo = formVenta.tipoDocumento || "V-";

    // Preparar datos del ticket térmico
    const ticketVenta = {
      numeroTicket: numeroTicketActual || `FAC-${Date.now().toString().slice(-6)}`,
      fecha: new Date().toISOString(),
      cliente: {
        nombre: clienteNombre,
        cedula: `${docTipo}${docNumero}`,
        telefono: formVenta.telefono || "",
      },
      items: renglonesVenta.map(r => ({
        nombre: `${r.nombre}${r.variante ? ` (${r.variante})` : ""}`,
        cantidad: r.cantidad,
        precio: r.precioUnitario,
      })),
      totalUSD: totalFacturaUsd,
      tasa: tasaBcv || 45.50,
      totalBs: totalFacturaUsd * (tasaBcv || 45.50),
      metodoPago: (formVenta.metodoPago || "Efectivo USD").toUpperCase(),
      cajero: usuario?.nombre || "Cajero Principal",
    };

    // Si la venta está marcada como crédito y deja saldo, abrir modal de autorización/cobro detallado
    if (formVenta.condicionVenta === "CREDITO" && saldoProyectadoCobro > 0 && !autorizacionCredito) {
      setModalCobroAbierto(true);
      return;
    }

    // Registrar la venta en cuentas y descontar inventario
    registrarVenta(autorizacionCredito);

    // Abrir ticket térmico para imprimir
    setDatosUltimoTicket(ticketVenta);
    if (typeof window !== "undefined") {
      localStorage.setItem("duna_ultimo_ticket", JSON.stringify(ticketVenta));
    }
    setModalTicketAbierto(true);
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
    setModalAuditoriaAbierto(false);
    setTokenPagoActivo(null);
    setAvisoClienteEnEspera(null);
    setNumeroTicketActual(`FAC-${Date.now().toString().slice(-6)}`);
    inputProductoRef.current?.focus();
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
    setTokenPagoActivo(null);
    setAvisoClienteEnEspera(null);
    localStorage.removeItem("duna_pos_draft");
    setDraftDetectado(null);
    inputProductoRef.current?.focus();

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

  const handleEnviarWhatsapp = (cuenta) => {
    const numero = `${(cuenta.paisCodigo || "+58").replace("+", "")}${limpiarTelefono(cuenta.telefono)}`;
    const saldoBs = formatearBs(cuenta.saldo, tasaBcv);
    const lineasProductos = (cuenta.renglones || []).map(r => {
      const variantePart = r.variante ? ` (${r.variante})` : "";
      const extrasPart = r.toppings && r.toppings.length > 0 ? ` [Extras: ${r.toppings.map(t => t.nombre).join(", ")}]` : "";
      return `• ${r.cantidad}x ${r.nombre}${variantePart}${extrasPart} - $${r.subtotal.toFixed(2)}`;
    }).join("\n");

    const mensaje = `Estimado(a) *${cuenta.cliente}*, le saludamos de *D'una*. Le compartimos el estado de su cuenta:\n${lineasProductos}\nFactura: *${cuenta.id}* | Total: *$${cuenta.total.toFixed(2)}* | Abonado: *$${cuenta.abonado.toFixed(2)}* | Saldo pendiente: *$${cuenta.saldo.toFixed(2)} USD* (*Bs. ${saldoBs}* a Tasa BCV: Bs. ${tasaBcv}). Quedamos atentos a su comprobante.`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
  };

  const pillClase = (activo) =>
    `px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
      activo ? "bg-[#FE6712] text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200 hover:border-[#FE6712] hover:text-[#FE6712]"
    }`;

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col font-sans">

      {/* Cabecera Operativa de Caja */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-[37px] z-40">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition border border-slate-200 shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900">Terminal POS</span>
                <span className="text-[11px] bg-sky-50 text-sky-700 px-2.5 py-0.5 rounded-full font-bold border border-sky-200">CAJA</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate">Mostrador de facturación rápida</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => abrirTicket()} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#FE6712] hover:bg-[#e0580a] text-white flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer">📋 Reimprimir Ticket</button>
          {turnoActivo ? (
              <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-2">
                <Wallet className="w-4 h-4 text-emerald-700" />
                <div className="leading-tight">
                  <span className="text-[11px] font-black text-emerald-800 block">Turno {turnoActivo.id} — ABIERTO</span>
                  <span className="text-[10px] text-emerald-600">Apertura: {turnoActivo.fechaApertura} · {turnoActivo.ventasIds.length} venta(s)</span>
                </div>
              </div>
            ) : (
              <span className="hidden sm:inline text-[11px] text-slate-400 font-semibold">Sin turno de caja abierto</span>
            )}
            {turnoActivo ? (
              <button onClick={handleCerrarTurno} className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition">
                Cerrar Turno / Arqueo
              </button>
            ) : (
              <button onClick={() => setModalTurnoAbierto(true)} className="px-3.5 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition">
                Abrir Turno de Caja
              </button>
            )}
            <Link href="/cxc" className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition whitespace-nowrap">
              Administración CXC →
            </Link>
          </div>
        </div>
      </header>

      {/* Ventana Flotante / Modal Express Centrada */}
      <main className="flex-1 w-full flex flex-col items-center gap-3 p-4 sm:p-8">

        {/* Banner de Recuperación de Borrador (crash recovery) */}
        {draftDetectado && (
          <div className="w-full max-w-4xl rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-emerald-50 p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <p className="text-[11px] font-bold text-slate-700 min-w-0">
                ⚠️ Venta en curso no finalizada para{" "}
                <span className="text-slate-900">{draftDetectado.cliente?.nombre || "Consumidor Final"}</span>
                {" "}({(draftDetectado.renglonesVenta || []).length} ítem{(draftDetectado.renglonesVenta || []).length === 1 ? "" : "s"} - ${totalBorrador.toFixed(2)}).
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

        {/* Barra de utilidades: Ventas en Espera */}
        <div className="w-full max-w-4xl flex items-center justify-end">
          <button
            type="button"
            onClick={() => setModalEsperaAbierto(true)}
            disabled={ventasEnEspera.length === 0}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-[11px] font-bold transition disabled:opacity-40 disabled:pointer-events-none"
          >
            ⏸ En Espera ({ventasEnEspera.length})
          </button>
        </div>

        {/* Ventana Flotante: Blanco Limpio y Elegante */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl p-6 flex flex-col gap-4 text-slate-800">

          {/* ===== Micro-Cabecera Corporativa en 2 Niveles ===== */}

          {/* Nivel Superior: Marca y Control */}
          <div className="flex items-center justify-between gap-3">
            <Image
              src="/duna-pos.png"
              alt="Duna POS"
              width={112}
              height={28}
              priority
              className="h-7 w-auto object-contain shrink-0"
            />
            <div className="flex items-center gap-2 shrink-0">
              <span className="bg-orange-50 text-[#FE6712] font-mono font-bold px-3 py-1.5 rounded-lg text-xs">
                {numeroTicketActual}
              </span>
              {turnoActivo ? (
                <span className="hidden sm:flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg text-[11px] font-bold">
                  <Wallet className="w-3.5 h-3.5" />
                  Turno {turnoActivo.id}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setModalTurnoAbierto(true)}
                  className="hidden sm:flex items-center gap-1.5 bg-slate-50 text-slate-500 border border-slate-200 px-2.5 py-1.5 rounded-lg text-[11px] font-bold hover:border-[#FE6712] hover:text-[#FE6712] transition"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Sin turno
                </button>
              )}
            </div>
          </div>

          {/* Nivel Inferior: Fila Fiscal y Contacto del Cliente */}
          <div className="flex flex-wrap items-stretch gap-2">

            {/* Selector Fiscal Obligatorio + Documento */}
            <div className="relative shrink-0">
              <div
                className={`flex items-stretch border rounded-lg overflow-hidden ${
                  errorDocumento
                    ? "bg-rose-50 border-rose-400"
                    : clienteCoincidenteActual || documentoBloqueado
                    ? "bg-emerald-50 border-emerald-300"
                    : "bg-slate-50 border-slate-200"
                } focus-within:border-[#FE6712]`}
              >
                <select
                  value={formVenta.tipoDocumento || "V-"}
                  onChange={(e) => setFormVenta({ ...formVenta, tipoDocumento: e.target.value })}
                  className="bg-black/5 border-r border-slate-200 text-xs font-bold text-slate-700 pl-2 pr-1 rounded-l-lg focus:outline-none cursor-pointer"
                  title="Tipo de documento fiscal"
                >
                  <option value="V-">V</option>
                  <option value="J-">J</option>
                  <option value="E-">E</option>
                  <option value="G-">G</option>
                  <option value="P-">P</option>
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  readOnly={documentoBloqueado}
                  value={formVenta.numeroDocumento}
                  onChange={(e) => handleCambiarNumeroDocumento(e.target.value)}
                  onFocus={() => setCampoActivoSugerencia("documento")}
                  onBlur={() => setTimeout(() => setCampoActivoSugerencia(null), 150)}
                  placeholder="Cédula/RIF"
                  autoComplete="off"
                  className={`w-28 bg-transparent pr-6 pl-2.5 py-1.5 text-xs font-medium placeholder:text-slate-400 focus:outline-none ${
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
                <div className="absolute z-10 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {filtrarClientes(formVenta.numeroDocumento).map((cl, i) => (
                    <button key={i} type="button" onMouseDown={() => handleSeleccionarCliente(cl)} className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-100 last:border-0">
                      <span className="font-bold text-slate-800 block text-xs">{cl.nombre}</span>
                      <span className="text-[10px] text-slate-400">{cl.documento || "Sin documento"} • {cl.codigoPais}{cl.telefono}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Nombre / Razón Social (ancho flexible) */}
            <div className="relative flex-1 min-w-[160px]">
              <input
                type="text"
                value={formVenta.cliente}
                onChange={(e) => setFormVenta({ ...formVenta, cliente: e.target.value })}
                onFocus={() => setCampoActivoSugerencia("cliente")}
                onBlur={() => setTimeout(() => setCampoActivoSugerencia(null), 150)}
                placeholder="Nombre / Razón Social"
                autoComplete="off"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#FE6712]"
              />
              {campoActivoSugerencia === "cliente" && filtrarClientes(formVenta.cliente).length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {filtrarClientes(formVenta.cliente).map((cl, i) => (
                    <button key={i} type="button" onMouseDown={() => handleSeleccionarCliente(cl)} className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-100 last:border-0">
                      <span className="font-bold text-slate-800 block text-xs">{cl.nombre}</span>
                      <span className="text-[10px] text-slate-400">{cl.documento || "Sin documento"} • {cl.codigoPais}{cl.telefono}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Teléfono con Código de País */}
            <div className="flex items-stretch bg-slate-50 border border-slate-200 rounded-lg overflow-hidden focus-within:border-[#FE6712] shrink-0">
              <select
                value={formVenta.paisCodigo || "+58"}
                onChange={(e) => setFormVenta({ ...formVenta, paisCodigo: e.target.value })}
                className="bg-black/5 border-r border-slate-200 text-xs font-bold text-slate-700 pl-2 pr-1 rounded-l-lg focus:outline-none cursor-pointer"
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
                className="w-28 bg-transparent px-2.5 py-1.5 text-xs placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Domicilio Fiscal del Cliente */}
          <input
            type="text"
            value={formVenta.direccion}
            onChange={(e) => setFormVenta({ ...formVenta, direccion: e.target.value })}
            placeholder="📍 Dirección / Domicilio Fiscal del Cliente (Obligatorio)..."
            autoComplete="off"
            className="w-full text-xs py-1.5 px-3 rounded border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:border-[#FE6712]"
          />

          {/* Avisos compactos: deuda del cliente detectado y ticket en espera */}
          {errorDocumento && (
            <p className="text-[10px] text-rose-600 font-bold -mt-2">La Cédula o RIF es obligatoria para emitir la factura.</p>
          )}
          {clienteCoincidenteActual && cantidadFacturasPendientes > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-amber-700 -mt-1">
              <span>⚠️ Deuda: ${deudaTotalUsd.toFixed(2)} (~Bs. {deudaTotalBs.toFixed(2)}) • {cantidadFacturasPendientes} fact.</span>
              <button
                type="button"
                onClick={() => setModalAuditoriaAbierto(true)}
                className="px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-[10px] font-black text-amber-700 hover:bg-amber-100 transition shrink-0"
              >
                Ver / Cobrar Facturas
              </button>
            </div>
          )}
          {avisoClienteEnEspera && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-sky-700 -mt-1">
              <span>💡 Este cliente tiene un ticket en espera de ${avisoClienteEnEspera.total.toFixed(2)}. ¿Deseas retomarlo?</span>
              <button
                type="button"
                onClick={() => handleRetomarVentaEnEspera(avisoClienteEnEspera)}
                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[10px] font-black transition shrink-0"
              >
                Sí, retomar
              </button>
            </div>
          )}

          {/* Buscador Predictivo Limpio (sin catálogo previo visible) */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputProductoRef}
              type="text"
              value={busquedaProducto}
              onChange={(e) => { setBusquedaProducto(e.target.value); setMostrarSugerenciasProducto(true); }}
              onFocus={() => setMostrarSugerenciasProducto(true)}
              onBlur={() => setTimeout(() => setMostrarSugerenciasProducto(false), 150)}
              onKeyDown={handleBusquedaProductoKeyDown}
              placeholder="Escanear código de barras o buscar producto..."
              autoComplete="off"
              autoFocus
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:border-[#FE6712] focus:ring-2 focus:ring-orange-100 transition"
            />
            {mostrarSugerenciasProducto && busquedaProducto && productosFiltradosCombo.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {productosFiltradosCombo.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={() => handleAgregarProductoDirecto(p)}
                    className="w-full flex items-center gap-2.5 text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-100 last:border-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- miniatura dinámica (Base64/URL arbitraria), incompatible con next/image sin configurar dominios */}
                    <img src={p.image} alt="" className="w-8 h-8 rounded-lg object-cover bg-slate-100 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-slate-800 text-xs block truncate">{p.name}</span>
                      <span className="text-[10px] text-slate-400">{p.code} • Stock: {p.stock}</span>
                    </div>
                    <span className="text-xs font-black text-slate-900 shrink-0">${p.price.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {productosInventario.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-center space-y-1.5">
              <p className="text-[11px] font-bold text-amber-700">Aún no hay productos registrados en el catálogo.</p>
              <Link
                href="/inventario"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-lg text-[11px] font-bold transition"
              >
                Registrar o importar productos →
              </Link>
            </div>
          )}

          {productoSeleccionado && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
              <div className="text-[11px] font-bold text-slate-700">
                Configurando: <span className="text-[#FE6712]">{productoSeleccionado.name}</span>
              </div>

              {esGastronomiaConVariantes && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Sabor / Variante *</label>
                  <select
                    required
                    value={itemActual.varianteNombre}
                    onChange={(e) => setItemActual(prev => ({ ...prev, varianteNombre: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  >
                    <option value="">Seleccionar sabor...</option>
                    {productoSeleccionado.variantes.map(v => (
                      <option key={v.nombre} value={v.nombre}>{v.nombre} (Stock: {v.stock})</option>
                    ))}
                  </select>
                </div>
              )}

              {productoSeleccionado.toppings?.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1.5">Toppings / Modificadores</label>
                  <div className="flex flex-wrap gap-1.5">
                    {productoSeleccionado.toppings.map(t => {
                      const activo = itemActual.toppingsSeleccionadosIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleToggleTopping(t)}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
                            activo
                              ? "bg-[#FE6712] text-white border-[#FE6712] shadow-sm"
                              : "bg-white text-slate-600 border-slate-200 hover:border-[#FE6712] hover:text-[#FE6712]"
                          }`}
                        >
                          {t.nombre} {Number(t.precioExtra) > 0 ? `(+$${Number(t.precioExtra).toFixed(2)})` : "(Gratis)"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={itemActual.cantidad}
                    onChange={(e) => setItemActual(prev => ({ ...prev, cantidad: Number(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block mb-1">Subtotal</span>
                  <span className="block px-3 py-2 text-xs font-black text-slate-900">${subtotalActual.toFixed(2)}</span>
                </div>
                <button
                  type="button"
                  onClick={handleAgregarAlTicket}
                  className="px-3 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar al Ticket
                </button>
              </div>
            </div>
          )}

          {/* Ticket de Venta Integrado */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {renglonesVenta.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-[11px] text-slate-400">Escanee un código de barras o busque un producto para iniciar el ticket.</p>
              </div>
            ) : (
              <div className="max-h-[36vh] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="p-3">Cantidad</th>
                      <th className="p-3">Descripción</th>
                      <th className="p-3">P. Unitario</th>
                      <th className="p-3">Subtotal</th>
                      <th className="p-3 text-right">Quitar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {renglonesVenta.map(r => (
                      <tr key={r.tempId} className="hover:bg-slate-50/60 transition">
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => handleDecrementarRenglon(r.tempId)} className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold shrink-0">−</button>
                            <input
                              type="number"
                              min="1"
                              value={r.cantidad}
                              onChange={(e) => handleActualizarCantidadRenglon(r.tempId, e.target.value)}
                              className="w-10 text-center px-1 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold"
                            />
                            <button type="button" onClick={() => handleIncrementarRenglon(r.tempId)} className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold shrink-0">+</button>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-slate-800 block">{r.nombre}</span>
                          {(r.variante || r.toppings.length > 0) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {r.variante && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[9px] font-bold">{r.variante}</span>
                              )}
                              {r.toppings.map(t => (
                                <span key={t.id} className="px-1.5 py-0.5 rounded bg-orange-50 text-[#FE6712] text-[9px] font-bold">{t.nombre}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-slate-600">${r.precioUnitario.toFixed(2)}</td>
                        <td className="p-3">
                          <span className="font-black text-slate-900 block">${r.subtotal.toFixed(2)}</span>
                          <span className="text-[10px] text-emerald-600 font-bold">Bs. {formatearBs(r.subtotal, tasaBcv)}</span>
                        </td>
                        <td className="p-3 text-right">
                          <button type="button" onClick={() => handleEliminarRenglon(r.tempId)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pie del Ticket */}
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total</span>
              <div className="text-2xl font-black text-slate-900">
                ${totalFacturaUsd.toFixed(2)}
                <span className="text-sm font-bold text-emerald-600 ml-2">Bs. {formatearBs(totalFacturaUsd, tasaBcv)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePonerEnEspera}
                disabled={renglonesVenta.length === 0}
                title={renglonesVenta.length === 0 ? "Agrega al menos un producto al ticket" : "Pausar esta venta y liberar el mostrador"}
                className="w-10 h-10 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded-xl transition flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none shrink-0"
              >
                <PauseCircle className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleLimpiarTicket}
                title="Vaciar ticket y empezar de nuevo"
                className="w-10 h-10 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 rounded-xl transition flex items-center justify-center shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleConfirmarVentaDirecta}
                disabled={renglonesVenta.length === 0 || !formVenta.numeroDocumento.trim() || !formVenta.cliente.trim()}
                className="px-6 py-3 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-sm font-black transition flex items-center justify-center gap-2 shadow-sm shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              >
                <CreditCard className="w-4 h-4" /> Confirmar Venta / Cobrar
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Modal de Cobro / Medios de Pago */}
      {modalCobroAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Cobrar / Finalizar Venta</h3>
                <p className="text-xs text-slate-400">{formVenta.cliente || "Consumidor Final"} • Total ${totalFacturaUsd.toFixed(2)}</p>
              </div>
              <button onClick={() => setModalCobroAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCrearVenta} className="space-y-4">
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
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <p className="text-[11px] font-bold text-emerald-700">Venta de Contado: se cobra el 100% del total al momento, sin dejar saldo.</p>
                  <p className="text-lg font-black text-emerald-800 mt-1">${totalFacturaUsd.toFixed(2)}</p>
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
                      onChange={(e) => setFormVenta({ ...formVenta, metodoPago: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                    >
                      {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  {requiereDatosTransferenciaVenta && (
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
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={handleEnviarLinkPagoMovil}
                        disabled={!formVenta.telefono}
                        title={formVenta.telefono ? "Crear link de autoservicio y enviarlo por WhatsApp" : "Sin teléfono del cliente registrado"}
                        className="w-full px-3 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none shadow-sm shadow-orange-500/20"
                      >
                        <Smartphone className="w-3.5 h-3.5" /> Enviar Link de Pago Móvil por WhatsApp
                      </button>

                      {pagoMovilActivo?.status === "REPORTADO" ? (
                        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 flex items-center gap-3 animate-pulse">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                            <Check className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-black text-emerald-700 block">✓ ¡Comprobante reportado por el cliente!</span>
                            <span className="text-[10px] text-emerald-600">Referencia: {pagoMovilActivo.referenciaReportada || "—"}</span>
                          </div>
                          {pagoMovilActivo.imagenComprobante && (
                            /* eslint-disable-next-line @next/next/no-img-element -- miniatura Base64 generada por el cliente, incompatible con next/image */
                            <img
                              src={pagoMovilActivo.imagenComprobante}
                              alt="Comprobante"
                              onClick={() => setModalComprobanteAbierto(true)}
                              className="w-10 h-10 rounded-lg object-cover border border-emerald-300 cursor-pointer shrink-0 hover:opacity-80 transition"
                            />
                          )}
                        </div>
                      ) : tokenPagoActivo ? (
                        <p className="text-[10px] text-slate-400 text-center">Esperando que el cliente reporte su pago desde el link enviado…</p>
                      ) : null}

                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        <button
                          type="button"
                          onClick={handleEnviarDatosPagoMovil}
                          disabled={!formVenta.telefono}
                          title={formVenta.telefono ? "Enviar datos de pago móvil por WhatsApp" : "Sin teléfono del cliente registrado"}
                          className="w-full sm:flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> Enviar Datos Pago Móvil por WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={handleCopiarDatosPagoMovil}
                          className="w-full sm:w-auto px-3 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5 shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5" /> {copiadoDatosPagoMovil ? "¡Copiado!" : "Copiar Datos"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalCobroAbierto(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formVenta.numeroDocumento.trim().length < 5 || renglonesVenta.length === 0 || referenciaVentaDuplicada}
                  title={
                    formVenta.numeroDocumento.trim().length < 5
                      ? "La Cédula o RIF es obligatoria para emitir la factura"
                      : renglonesVenta.length === 0
                      ? "Agrega al menos un producto al ticket"
                      : referenciaVentaDuplicada
                      ? "Esta referencia ya fue registrada anteriormente"
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
                    <><Check className="w-4 h-4" /> Registrar Factura</>
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

      {/* Modal Auditoría de Deuda */}
      {modalAuditoriaAbierto && clienteCoincidenteActual && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Auditoría de Deuda</h3>
                <p className="text-xs text-slate-400">{clienteCoincidenteActual.nombre} • {clienteCoincidenteActual.documento}</p>
              </div>
              <button onClick={() => setModalAuditoriaAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
                <span className="text-[11px] font-bold text-rose-500 uppercase block">Deuda Total</span>
                <div className="text-2xl font-black text-rose-700">${deudaTotalUsd.toFixed(2)}</div>
                <div className="text-xs text-rose-500 font-semibold">Bs. {formatearBs(deudaTotalUsd, tasaBcv)}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center flex flex-col justify-center">
                <span className="text-[11px] font-bold text-slate-500 uppercase block">Facturas Pendientes</span>
                <div className="text-2xl font-black text-slate-900">{cantidadFacturasPendientes}</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Factura / Fecha</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Saldo</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {facturasAdeudadasCliente.map(f => (
                    <tr key={f.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-3">
                        <strong className="block font-black text-slate-900">{f.id}</strong>
                        <span className="text-[11px] text-slate-400">{f.fecha}</span>
                      </td>
                      <td className="p-3 font-bold text-slate-800">${f.total.toFixed(2)}</td>
                      <td className="p-3">
                        <span className="font-black text-rose-600 block">${f.saldo.toFixed(2)}</span>
                        <span className="text-[10px] text-rose-400 font-semibold">Bs. {formatearBs(f.saldo, tasaBcv)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleEnviarWhatsapp(f)}
                          disabled={!f.telefono}
                          title={f.telefono ? "Cobrar por WhatsApp" : "Sin teléfono registrado"}
                          className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg border border-emerald-200 hover:border-emerald-600 transition disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setModalAuditoriaAbierto(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">
                Cerrar y continuar con la venta
              </button>
            </div>
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

      {/* Visor de Comprobante a pantalla completa */}
      {modalComprobanteAbierto && pagoMovilActivo?.imagenComprobante && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/90 flex items-center justify-center p-4"
          onClick={() => setModalComprobanteAbierto(false)}
        >
          <button
            type="button"
            onClick={() => setModalComprobanteAbierto(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen Base64 generada por el cliente, incompatible con next/image */}
          <img
            src={pagoMovilActivo.imagenComprobante}
            alt="Comprobante de pago"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
          />
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
  </div>
  );
}

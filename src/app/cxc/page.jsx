"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Search, Plus, Check, X,
  Receipt, Trash2, MessageCircle, ShieldCheck, Wallet, Copy, Settings, Smartphone
} from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { useUser } from "@/context/UserContext";
import bancosVenezuela from "@/data/bancosVenezuela";

const PAISES = [
  { code: "+58", name: "Venezuela" },
  { code: "+57", name: "Colombia" },
  { code: "+56", name: "Chile" },
  { code: "+593", name: "Ecuador" },
  { code: "+1", name: "USA/Canadá" },
  { code: "+34", name: "España" },
  { code: "+507", name: "Panamá" },
  { code: "+51", name: "Perú" },
  { code: "+54", name: "Argentina" },
  { code: "+52", name: "México" },
  { code: "+55", name: "Brasil" },
];

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

const TIPOS_DOCUMENTO = ["V-", "J-", "E-", "G-", "P-"];

const DATOS_PAGO_INICIAL = {
  metodoPago: "Efectivo USD",
  bancoEmisor: "",
  bancoReceptor: "",
  referencia: "",
  titular: "",
};

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
  ...DATOS_PAGO_INICIAL,
  nota: ""
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

function limpiarTelefono(str) {
  return String(str || "").replace(/\D/g, "").replace(/^0+/, "");
}

function formatearBs(montoUsd, tasaBcv) {
  return (montoUsd * tasaBcv).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export default function CXCPage() {
  const { modoMoneda, tasaBcv } = useCurrency();
  const { usuario } = useUser();

  const [cuentas, setCuentas] = useState([]);
  const [productosInventario, setProductosInventario] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [modalVentaAbierto, setModalVentaAbierto] = useState(false);

  const [formVenta, setFormVenta] = useState(FORM_VENTA_INICIAL);
  const [campoActivoSugerencia, setCampoActivoSugerencia] = useState(null);
  const [documentoBloqueado, setDocumentoBloqueado] = useState(false);
  const [errorDocumento, setErrorDocumento] = useState(false);

  const [renglonesVenta, setRenglonesVenta] = useState([]);
  const [itemActual, setItemActual] = useState(ITEM_ACTUAL_INICIAL);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [mostrarSugerenciasProducto, setMostrarSugerenciasProducto] = useState(false);

  const [modalAbonoAbierto, setModalAbonoAbierto] = useState(false);
  const [cuentaAbonoActual, setCuentaAbonoActual] = useState(null);
  const [monedaAbonoModal, setMonedaAbonoModal] = useState("usd");
  const [montoAbonoModal, setMontoAbonoModal] = useState("");
  const [pagoAbonoModal, setPagoAbonoModal] = useState(DATOS_PAGO_INICIAL);

  const [modalTurnoAbierto, setModalTurnoAbierto] = useState(false);
  const [montoInicialUsd, setMontoInicialUsd] = useState("");
  const [montoInicialBs, setMontoInicialBs] = useState("");

  const [modalAuditoriaAbierto, setModalAuditoriaAbierto] = useState(false);

  const [configPagoMovil, setConfigPagoMovil] = useState(CONFIG_PAGOMOVIL_DEFECTO);
  const [modalConfigPagoMovilAbierto, setModalConfigPagoMovilAbierto] = useState(false);
  const [formConfigPagoMovil, setFormConfigPagoMovil] = useState(CONFIG_PAGOMOVIL_DEFECTO);
  const [copiadoDatosPagoMovil, setCopiadoDatosPagoMovil] = useState(false);

  const [pagosPendientes, setPagosPendientes] = useState([]);
  const [tokenPagoActivo, setTokenPagoActivo] = useState(null);
  const [modalComprobanteAbierto, setModalComprobanteAbierto] = useState(false);

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

    const prods = localStorage.getItem("duna_inventario_prods");
    if (prods) {
      try {
        setProductosInventario(JSON.parse(prods));
      } catch (e) {
        console.error(e);
      }
    }

    const dirClientes = localStorage.getItem("duna_clientes");
    if (dirClientes) {
      try {
        setClientes(JSON.parse(dirClientes));
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

    const pagosGuardados = localStorage.getItem("duna_pagos_pendientes");
    if (pagosGuardados) {
      try {
        setPagosPendientes(JSON.parse(pagosGuardados));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

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

  const actualizarPagosPendientes = (nuevos) => {
    setPagosPendientes(nuevos);
    localStorage.setItem("duna_pagos_pendientes", JSON.stringify(nuevos));
  };

  const actualizarProductosInventario = (nuevos) => {
    setProductosInventario(nuevos);
    localStorage.setItem("duna_inventario_prods", JSON.stringify(nuevos));
  };

  const actualizarClientes = (nuevos) => {
    setClientes(nuevos);
    localStorage.setItem("duna_clientes", JSON.stringify(nuevos));
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
  };

  // Cédula/RIF es la clave única: se libera solo con una acción explícita del usuario
  const handleDesbloquearDocumento = () => {
    setDocumentoBloqueado(false);
    setFormVenta(prev => ({ ...prev, tipoDocumento: "V-", numeroDocumento: "", cliente: "", paisCodigo: "+58", telefono: "", direccion: "", condicionVenta: "CREDITO" }));
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

  const productosFiltradosCombo = (busquedaProducto
    ? productosInventario.filter(p =>
        p.name.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        p.code.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        (p.barcode || "").toLowerCase().includes(busquedaProducto.toLowerCase())
      )
    : productosInventario
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
  };

  // Enter tras escanear código de barras: si el producto no exige variante, se agrega 1 unidad directo al ticket
  const handleBusquedaProductoKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const match = productosInventario.find(p => p.barcode && p.barcode === busquedaProducto.trim());
    if (!match) return;

    const requiereVariante = match.nicho === "Gastronomía & Heladería" && (match.variantes || []).length > 0;
    if (requiereVariante) {
      handleSeleccionarProducto(match);
      return;
    }

    agregarProductoAlTicket(match, "", [], 1);
    setBusquedaProducto("");
    setItemActual(ITEM_ACTUAL_INICIAL);
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

  // El cliente encontrado en duna_pagos_pendientes para el token generado en esta venta (se actualiza por polling)
  const pagoMovilActivo = tokenPagoActivo ? pagosPendientes.find(p => p.token === tokenPagoActivo) || null : null;

  // Crea la intención de pago con token y abre WhatsApp con el link de autoservicio
  const handleEnviarLinkPagoMovil = () => {
    const token = generarTokenPago();
    const nuevaIntencion = {
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
    actualizarPagosPendientes([nuevaIntencion, ...pagosPendientes]);
    setTokenPagoActivo(token);

    const link = `${window.location.origin}/pago/${token}`;
    const numero = `${(formVenta.paisCodigo || "+58").replace("+", "")}${limpiarTelefono(formVenta.telefono)}`;
    const mensaje = `Hola *${formVenta.cliente || "cliente"}*, para completar tu compra realiza tu Pago Móvil desde este link seguro:\n${link}\n\n💰 Monto: *Bs. ${formatearBs(montoPagoMovilUsd, tasaBcv)}* (≈ $${montoPagoMovilUsd.toFixed(2)} USD)\n\nAl confirmar tu pago allí, tu factura queda lista para validarse en caja.`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
  };

  // Escucha reactiva: revisa cada 2s si el cliente reportó el comprobante para el token activo
  useEffect(() => {
    if (!tokenPagoActivo) return undefined;
    const intervalo = setInterval(() => {
      try {
        const guardados = JSON.parse(localStorage.getItem("duna_pagos_pendientes") || "[]");
        const match = guardados.find(p => p.token === tokenPagoActivo);
        if (match && match.status === "REPORTADO") {
          setPagosPendientes(guardados);
          setFormVenta(prev => ({ ...prev, referencia: match.referenciaReportada || prev.referencia }));
        }
      } catch (e) {
        console.error(e);
      }
    }, 2000);
    return () => clearInterval(intervalo);
  }, [tokenPagoActivo]);

  // Guardar Venta y registrar cuenta por cobrar
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

    const nuevaCuenta = {
      // eslint-disable-next-line react-hooks/purity -- id generado en un manejador de evento (submit), no durante el render
      id: `FAC-${Date.now().toString().slice(-6)}`,
      fecha: new Date().toLocaleDateString("es-VE"),
      cliente: formVenta.cliente,
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
      // eslint-disable-next-line react-hooks/purity -- id generado en un manejador de evento (submit), no durante el render
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
      actualizarClientes(clientes.map(c => c === clienteExistente ? clienteActualizado : c));
    } else {
      actualizarClientes([clienteActualizado, ...clientes]);
    }

    // Adjuntar la venta al turno de caja activo
    if (turnoActivo) {
      actualizarTurnos(turnos.map(t =>
        t.id === turnoActivo.id ? { ...t, ventasIds: [...t.ventasIds, nuevaCuenta.id] } : t
      ));
    }

    actualizarCuentas([nuevaCuenta, ...cuentas]);
    setModalVentaAbierto(false);
    setFormVenta({ ...FORM_VENTA_INICIAL, bancoReceptor: configPagoMovil.bancoReceptor || "" });
    setRenglonesVenta([]);
    setItemActual(ITEM_ACTUAL_INICIAL);
    setBusquedaProducto("");
    setDocumentoBloqueado(false);
    setErrorDocumento(false);
    setModalAuditoriaAbierto(false);
    setTokenPagoActivo(null);
  };

  const handleCerrarModalVenta = () => {
    setModalVentaAbierto(false);
    setFormVenta({ ...FORM_VENTA_INICIAL, bancoReceptor: configPagoMovil.bancoReceptor || "" });
    setRenglonesVenta([]);
    setItemActual(ITEM_ACTUAL_INICIAL);
    setBusquedaProducto("");
    setDocumentoBloqueado(false);
    setErrorDocumento(false);
    setModalAuditoriaAbierto(false);
    setTokenPagoActivo(null);
  };

  // Modal dedicado de abonos posteriores
  const abrirModalAbono = (cuenta) => {
    setCuentaAbonoActual(cuenta);
    setMonedaAbonoModal("usd");
    setMontoAbonoModal("");
    setPagoAbonoModal(DATOS_PAGO_INICIAL);
    setModalAbonoAbierto(true);
  };

  const montoAbonoModalUsd = monedaAbonoModal === "ves"
    ? (Number(montoAbonoModal) || 0) / (tasaBcv || 1)
    : (Number(montoAbonoModal) || 0);

  const requiereDatosTransferenciaAbono = METODOS_CON_REFERENCIA.includes(pagoAbonoModal.metodoPago);
  const referenciaAbonoDuplicada = requiereDatosTransferenciaAbono &&
    pagoAbonoModal.referencia.trim().length > 0 &&
    referenciasUsadas.has(pagoAbonoModal.referencia.trim());

  const confirmarAbono = () => {
    if (!cuentaAbonoActual || montoAbonoModalUsd <= 0) return;

    if (requiereDatosTransferenciaAbono) {
      const ref = pagoAbonoModal.referencia.trim();
      if (!ref) {
        alert("Indica el número de referencia del pago.");
        return;
      }
      if (referenciasUsadas.has(ref)) {
        alert("Esta referencia ya fue registrada anteriormente. Verifica el número.");
        return;
      }
    }

    const nuevoAbonado = cuentaAbonoActual.abonado + montoAbonoModalUsd;
    const nuevoSaldo = Math.max(0, cuentaAbonoActual.total - nuevoAbonado);
    const nuevoEstado = nuevoSaldo === 0 ? "PAGADO" : "PARCIAL";
    const registroAbono = {
      fecha: new Date().toLocaleString("es-VE"),
      moneda: monedaAbonoModal,
      montoOriginal: Number(montoAbonoModal) || 0,
      tasaBcv,
      montoUsd: montoAbonoModalUsd,
      metodoPago: pagoAbonoModal.metodoPago,
      bancoEmisor: requiereDatosTransferenciaAbono ? pagoAbonoModal.bancoEmisor : "",
      bancoReceptor: requiereDatosTransferenciaAbono ? pagoAbonoModal.bancoReceptor : "",
      referencia: requiereDatosTransferenciaAbono ? pagoAbonoModal.referencia.trim() : "",
      titular: requiereDatosTransferenciaAbono ? pagoAbonoModal.titular : "",
    };

    const actualizadas = cuentas.map(c => {
      if (c.id === cuentaAbonoActual.id) {
        return {
          ...c,
          abonado: nuevoAbonado,
          saldo: nuevoSaldo,
          estado: nuevoEstado,
          historialAbonos: [...(c.historialAbonos || []), registroAbono],
        };
      }
      return c;
    });
    actualizarCuentas(actualizadas);
    setModalAbonoAbierto(false);
    setCuentaAbonoActual(null);
  };

  const handleEliminarCuenta = (id) => {
    if (confirm("¿Seguro que deseas eliminar este registro?")) {
      actualizarCuentas(cuentas.filter(c => c.id !== id));
    }
  };

  const handleEnviarWhatsapp = (cuenta) => {
    const numero = `${(cuenta.paisCodigo || "+58").replace("+", "")}${limpiarTelefono(cuenta.telefono)}`;
    const saldoBs = formatearBs(cuenta.saldo, tasaBcv);

    let lineasProductos;
    if (cuenta.renglones && cuenta.renglones.length > 0) {
      lineasProductos = cuenta.renglones.map(r => {
        const variantePart = r.variante ? ` (${r.variante})` : "";
        const extrasPart = r.toppings && r.toppings.length > 0 ? ` [Extras: ${r.toppings.map(t => t.nombre).join(", ")}]` : "";
        return `• ${r.cantidad}x ${r.nombre}${variantePart}${extrasPart} - $${r.subtotal.toFixed(2)}`;
      }).join("\n");
    } else {
      // Compatibilidad con facturas de un solo producto registradas antes del ticket multi-renglón
      const lineaExtras = cuenta.extras && cuenta.extras.length > 0 ? ` [Extras: ${cuenta.extras.join(", ")}]` : "";
      lineasProductos = `• ${cuenta.cantidad}x ${cuenta.productoNombre} ($${(cuenta.precioBaseUnitario || 0).toFixed(2)})${lineaExtras}`;
    }

    const mensaje = `Estimado(a) *${cuenta.cliente}*, le saludamos de *D'una*. Le compartimos el estado de su cuenta:\n${lineasProductos}\nFactura: *${cuenta.id}* | Total: *$${cuenta.total.toFixed(2)}* | Abonado: *$${cuenta.abonado.toFixed(2)}* | Saldo pendiente: *$${cuenta.saldo.toFixed(2)} USD* (*Bs. ${saldoBs}* a Tasa BCV: Bs. ${tasaBcv}). Quedamos atentos a su comprobante.`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
  };

  // Totales
  const totalPorCobrarUsd = cuentas.reduce((acc, c) => acc + c.saldo, 0);
  const totalCobradoUsd = cuentas.reduce((acc, c) => acc + c.abonado, 0);

  const formatearMonto = (montoUsd) => {
    const bcv = formatearBs(montoUsd, tasaBcv);
    if (modoMoneda === "usd") return `$${montoUsd.toFixed(2)}`;
    if (modoMoneda === "ves") return `Bs. ${bcv}`;
    return `$${montoUsd.toFixed(2)} / Bs. ${bcv}`;
  };

  const cuentasFiltradas = cuentas.filter(c =>
    c.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.id.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.documento.toLowerCase().includes(busqueda.toLowerCase())
  );

  const pillClase = (activo) =>
    `px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
      activo ? "bg-[#FE6712] text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200 hover:border-[#FE6712] hover:text-[#FE6712]"
    }`;

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col font-sans">

      {/* Header */}
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
                <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">VENTAS & CXC</span>
              </Link>
              <p className="text-[11px] text-slate-400 font-medium">Facturación a Crédito y Control de Cobranzas</p>
            </div>
          </div>

          <button
            onClick={() => setModalVentaAbierto(true)}
            className="px-4 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition flex items-center gap-2 shadow-sm shadow-orange-500/20"
          >
            <Plus className="w-4 h-4" /> Nueva Venta / Factura
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-6">

        {/* Turno de Caja */}
        <div className={`rounded-3xl border p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm ${
          turnoActivo ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${turnoActivo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              <Wallet className="w-4 h-4" />
            </div>
            {turnoActivo ? (
              <div>
                <span className="text-xs font-black text-emerald-800 block">Turno {turnoActivo.id} — ABIERTO</span>
                <span className="text-[11px] text-emerald-600">Apertura: {turnoActivo.fechaApertura} · Fondo: ${turnoActivo.montoInicialUsd.toFixed(2)} / Bs. {turnoActivo.montoInicialBs.toFixed(2)} · {turnoActivo.ventasIds.length} venta(s)</span>
              </div>
            ) : (
              <div>
                <span className="text-xs font-black text-slate-700 block">Sin turno de caja abierto</span>
                <span className="text-[11px] text-slate-400">Abre un turno para llevar el control de las ventas de la sesión.</span>
              </div>
            )}
          </div>
          {turnoActivo ? (
            <button onClick={handleCerrarTurno} className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition">
              Cerrar Turno
            </button>
          ) : (
            <button onClick={() => setModalTurnoAbierto(true)} className="px-3.5 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition">
              Abrir Turno de Caja
            </button>
          )}
        </div>

        {/* Métricas CXC */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-400">Total por Cobrar (Deuda Total)</span>
            <div className="text-2xl font-black text-slate-900 mt-2">
              {formatearMonto(totalPorCobrarUsd)}
            </div>
            <p className="text-[11px] text-amber-600 font-semibold mt-1">Saldos pendientes en calle</p>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-400">Total Recaudado (Abonos)</span>
            <div className="text-2xl font-black text-emerald-700 mt-2">
              {formatearMonto(totalCobradoUsd)}
            </div>
            <p className="text-[11px] text-emerald-600 font-semibold mt-1">Cobrado en el periodo</p>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm sm:col-span-2 lg:col-span-1">
            <span className="text-xs font-bold text-slate-400">Facturas Registradas</span>
            <div className="text-2xl font-black text-slate-900 mt-2">{cuentas.length}</div>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">Documentos comerciales</p>
          </div>
        </div>

        {/* Buscador */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cliente, cédula o factura..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FE6712] transition"
            />
          </div>
        </div>

        {/* Tabla de Cuentas */}
        {cuentas.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm my-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Receipt className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Sin facturas ni deudas</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Registra ventas a crédito o al contado para llevar el control de cobranzas y clientes.
              </p>
            </div>
            <button
              onClick={() => setModalVentaAbierto(true)}
              className="px-5 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition inline-flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Crear Primera Factura
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-4">Factura / Fecha</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4">Concepto</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Saldo Pendiente</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cuentasFiltradas.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-4">
                        <strong className="text-slate-900 block font-black">{c.id}</strong>
                        <span className="text-[11px] text-slate-400">{c.fecha}</span>
                      </td>
                      <td className="p-4">
                        <span className="font-bold text-slate-800 block">{c.cliente}</span>
                        <span className="text-[11px] text-slate-400">{c.documento} • {c.telefono ? `${c.paisCodigo || ""} ${c.telefono}` : "Sin teléfono"}</span>
                      </td>
                      <td className="p-4 text-slate-600">
                        {c.renglones && c.renglones.length > 0 ? (
                          <>
                            <span className="font-semibold text-slate-700 block">
                              {c.renglones[0].nombre}{c.renglones[0].variante ? ` (${c.renglones[0].variante})` : ""} x{c.renglones[0].cantidad}
                            </span>
                            {c.renglones.length > 1 && (
                              <span className="text-[11px] text-slate-400">
                                +{c.renglones.length - 1} artículo{c.renglones.length - 1 === 1 ? "" : "s"} más
                              </span>
                            )}
                          </>
                        ) : (
                          <>{c.productoNombre} (x{c.cantidad})</>
                        )}
                      </td>
                      <td className="p-4 font-black text-slate-900">
                        {formatearMonto(c.total)}
                      </td>
                      <td className="p-4 font-black text-rose-600">
                        {c.saldo > 0 ? formatearMonto(c.saldo) : "$0.00"}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                          c.estado === "PAGADO"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : c.estado === "PARCIAL"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}>
                          {c.estado}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEnviarWhatsapp(c)}
                            disabled={!c.telefono}
                            title={c.telefono ? "Enviar estado de cuenta por WhatsApp" : "Sin teléfono registrado"}
                            className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg border border-emerald-200 hover:border-emerald-600 transition disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          {c.saldo > 0 && (
                            <button
                              onClick={() => abrirModalAbono(c)}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-[11px] transition"
                            >
                              Abonar
                            </button>
                          )}
                          <button
                            onClick={() => handleEliminarCuenta(c.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal Nueva Factura */}
      {modalVentaAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Registrar Venta / Factura</h3>
                <p className="text-xs text-slate-400">Emisión al contado o a crédito con descuento de stock</p>
              </div>
              <button onClick={handleCerrarModalVenta} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCrearVenta} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="text-[11px] font-bold text-slate-600 block mb-1 flex items-center justify-between">
                    <span>Cédula / RIF *</span>
                    {clienteCoincidenteActual ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600">
                        <ShieldCheck className="w-3 h-3" /> Cliente Registrado
                      </span>
                    ) : documentoBloqueado && (
                      <button type="button" onClick={handleDesbloquearDocumento} className="text-[10px] font-bold text-slate-400 hover:text-[#FE6712] underline">
                        Cambiar
                      </button>
                    )}
                  </label>
                  <div className={`flex items-stretch border rounded-xl overflow-hidden focus-within:border-[#FE6712] ${
                    errorDocumento
                      ? "bg-rose-50 border-rose-400"
                      : clienteCoincidenteActual || documentoBloqueado
                      ? "bg-emerald-50 border-emerald-300"
                      : "bg-slate-50 border-slate-200"
                  }`}>
                    <select
                      value={formVenta.tipoDocumento}
                      disabled={documentoBloqueado}
                      onChange={(e) => setFormVenta({ ...formVenta, tipoDocumento: e.target.value })}
                      className="px-2 bg-black/5 border-r border-slate-200 text-xs font-bold text-slate-700 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      minLength={5}
                      readOnly={documentoBloqueado}
                      value={formVenta.numeroDocumento}
                      onChange={(e) => handleCambiarNumeroDocumento(e.target.value)}
                      onFocus={() => setCampoActivoSugerencia("documento")}
                      onBlur={() => setTimeout(() => setCampoActivoSugerencia(null), 150)}
                      placeholder="10089073"
                      autoComplete="off"
                      className={`flex-1 min-w-0 px-3 py-2 bg-transparent text-xs text-slate-800 focus:outline-none ${documentoBloqueado ? "cursor-not-allowed" : ""}`}
                    />
                  </div>
                  {errorDocumento && (
                    <p className="text-[10px] text-rose-600 font-bold mt-1">La Cédula o RIF es obligatoria para emitir la factura.</p>
                  )}
                  {campoActivoSugerencia === "documento" && filtrarClientes(formVenta.numeroDocumento).length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                      {filtrarClientes(formVenta.numeroDocumento).map((cl, i) => (
                        <button key={i} type="button" onMouseDown={() => handleSeleccionarCliente(cl)} className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-100 last:border-0">
                          <span className="font-bold text-slate-800 block text-xs">{cl.nombre}</span>
                          <span className="text-[10px] text-slate-400">{cl.documento || "Sin documento"} • {cl.codigoPais}{cl.telefono}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Nombre del Cliente *</label>
                  <input
                    type="text"
                    required
                    value={formVenta.cliente}
                    onChange={(e) => setFormVenta({ ...formVenta, cliente: e.target.value })}
                    onFocus={() => setCampoActivoSugerencia("cliente")}
                    onBlur={() => setTimeout(() => setCampoActivoSugerencia(null), 150)}
                    placeholder="Ej: Inversiones ABC"
                    autoComplete="off"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
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
              </div>

              {clienteCoincidenteActual && (
                <div className={`rounded-xl border px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold ${
                  cantidadFacturasPendientes > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                }`}>
                  {cantidadFacturasPendientes > 0 ? (
                    <>
                      <span>⚠️ Deuda: ${deudaTotalUsd.toFixed(2)} (~Bs. {deudaTotalBs.toFixed(2)}) • {cantidadFacturasPendientes} fact.</span>
                      <button
                        type="button"
                        onClick={() => setModalAuditoriaAbierto(true)}
                        className="px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-[10px] font-black text-amber-700 hover:bg-amber-100 transition shrink-0"
                      >
                        Ver / Cobrar Facturas
                      </button>
                    </>
                  ) : (
                    <span>✓ Al Día</span>
                  )}
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Condición de Venta</label>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setFormVenta({ ...formVenta, condicionVenta: "CONTADO" })} className={pillClase(formVenta.condicionVenta === "CONTADO")}>Solo Contado</button>
                  <button type="button" onClick={() => setFormVenta({ ...formVenta, condicionVenta: "CREDITO" })} className={pillClase(formVenta.condicionVenta === "CREDITO")}>Permite Crédito</button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Código País</label>
                  <select
                    value={formVenta.paisCodigo}
                    onChange={(e) => setFormVenta({ ...formVenta, paisCodigo: e.target.value })}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  >
                    {PAISES.map(p => (
                      <option key={p.code} value={p.code}>{p.code} {p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Teléfono (WhatsApp)</label>
                  <input
                    type="tel"
                    value={formVenta.telefono}
                    onChange={(e) => setFormVenta({ ...formVenta, telefono: e.target.value })}
                    placeholder="4121234567"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Dirección</label>
                <input
                  type="text"
                  value={formVenta.direccion}
                  onChange={(e) => setFormVenta({ ...formVenta, direccion: e.target.value })}
                  placeholder="Dirección de entrega o fiscal"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                />
              </div>

              <div className="relative">
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Buscar Producto (nombre, SKU o escanear código de barras)</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={busquedaProducto}
                    onChange={(e) => { setBusquedaProducto(e.target.value); setMostrarSugerenciasProducto(true); }}
                    onFocus={() => setMostrarSugerenciasProducto(true)}
                    onBlur={() => setTimeout(() => setMostrarSugerenciasProducto(false), 150)}
                    onKeyDown={handleBusquedaProductoKeyDown}
                    placeholder="Nombre, SKU o escanear código de barras..."
                    autoComplete="off"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
                  />
                </div>
                {mostrarSugerenciasProducto && productosFiltradosCombo.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {productosFiltradosCombo.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => handleSeleccionarProducto(p)}
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

              {productoSeleccionado && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-3">
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

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Ticket de Venta</label>
                {renglonesVenta.length === 0 ? (
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center">
                    <p className="text-[11px] text-slate-400">Escanee un código de barras o busque un producto para iniciar el ticket.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">Producto</th>
                          <th className="p-2.5">Cant.</th>
                          <th className="p-2.5">P. Unit.</th>
                          <th className="p-2.5">Subtotal</th>
                          <th className="p-2.5 text-right">—</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {renglonesVenta.map(r => (
                          <tr key={r.tempId}>
                            <td className="p-2.5">
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
                            <td className="p-2.5">
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => handleDecrementarRenglon(r.tempId)} className="w-5 h-5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold">−</button>
                                <input
                                  type="number"
                                  min="1"
                                  value={r.cantidad}
                                  onChange={(e) => handleActualizarCantidadRenglon(r.tempId, e.target.value)}
                                  className="w-10 text-center px-1 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold"
                                />
                                <button type="button" onClick={() => handleIncrementarRenglon(r.tempId)} className="w-5 h-5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold">+</button>
                              </div>
                            </td>
                            <td className="p-2.5 text-slate-600">${r.precioUnitario.toFixed(2)}</td>
                            <td className="p-2.5 font-black text-slate-900">${r.subtotal.toFixed(2)}</td>
                            <td className="p-2.5 text-right">
                              <button type="button" onClick={() => handleEliminarRenglon(r.tempId)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center justify-end gap-3 px-3 py-2.5 bg-slate-50 border-t border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500">Total Factura</span>
                      <span className="text-base font-black text-slate-900">${totalFacturaUsd.toFixed(2)}</span>
                      <span className="text-[11px] font-bold text-emerald-600">Bs. {formatearBs(totalFacturaUsd, tasaBcv)}</span>
                    </div>
                  </div>
                )}
              </div>

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
                  onClick={handleCerrarModalVenta}
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
                  className="px-5 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#FE6712]"
                >
                  <Check className="w-4 h-4" /> Registrar Factura
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Modal Abono Posterior */}
      {modalAbonoAbierto && cuentaAbonoActual && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Registrar Abono</h3>
                <p className="text-xs text-slate-400">Factura {cuentaAbonoActual.id} • {cuentaAbonoActual.cliente}</p>
              </div>
              <button onClick={() => setModalAbonoAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
              <span className="text-[11px] font-bold text-rose-500 uppercase block">Saldo Pendiente</span>
              <div className="text-2xl font-black text-rose-700">${cuentaAbonoActual.saldo.toFixed(2)}</div>
              <div className="text-xs text-rose-500 font-semibold">Bs. {formatearBs(cuentaAbonoActual.saldo, tasaBcv)}</div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1.5">Moneda de Pago</label>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setMonedaAbonoModal("usd")} className={pillClase(monedaAbonoModal === "usd")}>$ USD</button>
                <button type="button" onClick={() => setMonedaAbonoModal("ves")} className={pillClase(monedaAbonoModal === "ves")}>Bs VES</button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Monto a Abonar ({monedaAbonoModal === "usd" ? "$" : "Bs."})</label>
              <input
                type="number"
                step="0.01"
                value={montoAbonoModal}
                onChange={(e) => setMontoAbonoModal(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#FE6712]"
              />
              {Number(montoAbonoModal) > 0 && (
                <p className="text-[11px] text-emerald-600 font-bold mt-1.5">
                  {monedaAbonoModal === "ves"
                    ? `≈ $${montoAbonoModalUsd.toFixed(2)} USD`
                    : `≈ Bs. ${formatearBs(montoAbonoModalUsd, tasaBcv)}`}
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Método de Pago</label>
              <select
                value={pagoAbonoModal.metodoPago}
                onChange={(e) => setPagoAbonoModal({ ...pagoAbonoModal, metodoPago: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
              >
                {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {requiereDatosTransferenciaAbono && (
              <div className="grid grid-cols-2 gap-3">
                <select value={pagoAbonoModal.bancoEmisor} onChange={(e) => setPagoAbonoModal({ ...pagoAbonoModal, bancoEmisor: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <option value="">Banco emisor...</option>
                  {bancosVenezuela.map(b => <option key={b.codigo} value={b.codigo}>{b.display}</option>)}
                </select>
                <select value={pagoAbonoModal.bancoReceptor} onChange={(e) => setPagoAbonoModal({ ...pagoAbonoModal, bancoReceptor: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <option value="">Banco receptor...</option>
                  {bancosVenezuela.map(b => <option key={b.codigo} value={b.codigo}>{b.display}</option>)}
                </select>
                <div className="col-span-2">
                  <input
                    type="text"
                    required
                    value={pagoAbonoModal.referencia}
                    onChange={(e) => setPagoAbonoModal({ ...pagoAbonoModal, referencia: e.target.value })}
                    placeholder="N° de referencia *"
                    className={`w-full px-3 py-2 border rounded-xl text-xs focus:outline-none ${
                      referenciaAbonoDuplicada ? "bg-rose-50 border-rose-400" : "bg-slate-50 border-slate-200 focus:border-[#FE6712]"
                    }`}
                  />
                  {referenciaAbonoDuplicada && (
                    <p className="text-[10px] text-rose-600 font-bold mt-1">Esta referencia ya fue registrada anteriormente.</p>
                  )}
                </div>
                <input type="text" value={pagoAbonoModal.titular} onChange={(e) => setPagoAbonoModal({ ...pagoAbonoModal, titular: e.target.value })} placeholder="Teléfono / Titular" className="col-span-2 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setModalAbonoAbierto(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarAbono}
                disabled={montoAbonoModalUsd <= 0 || referenciaAbonoDuplicada}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Confirmar Abono
              </button>
            </div>
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
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEnviarWhatsapp(f)}
                            disabled={!f.telefono}
                            title={f.telefono ? "Cobrar por WhatsApp" : "Sin teléfono registrado"}
                            className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded-lg border border-emerald-200 hover:border-emerald-600 transition disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirModalAbono(f)}
                            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold text-[10px] transition"
                          >
                            Abonar
                          </button>
                        </div>
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

    </div>
  );
}

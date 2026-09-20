# ==============================================================================
# REGLAS DE ORO OBLIGATORIAS DEL PROYECTO (TOLERANCIA CERO A VIOLACIONES)
# ==============================================================================
# 1. AISLAMIENTO ESTRICTO DE ARCHIVO: Edita EXCLUSIVAMENTE el archivo solicitado
#    en la tarea actual. PROHIBIDO abrir o alterar otros archivos sin orden expresa.
# 2. CERO MODALES / POPUPS: Queda terminantemente PROHIBIDO usar 'fixed inset-0',
#    overlays oscuros o ventanas flotantes en reportes, historiales o navegación.
#    Todo debe renderizarse dentro del Workspace central. La ÚNICA excepción
#    autorizada en todo el sistema es la ventana flotante de la Terminal POS.
# 3. INTERFAZ 100% BLANCO LIMPIO: PROHIBIDO usar fondos oscuros (bg-slate-900,
#    bg-black, temas dark) en sidebars, contenedores o tablas. Todo el ERP debe ser
#    blanco y minimalista (bg-white, border-slate-200, text-slate-800).
# 4. PARCHES QUIRÚRGICOS SIN REGRESIONES: Toda funcionalidad que ya esté operativa
#    queda protegida. No se refactoriza ni se altera; solo se inserta el cambio puntual.
# ==============================================================================

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ==============================================================================
# TERMINAL POS (src/app/pos/page.jsx): ARQUITECTURA Y CONVENCIONES
# ==============================================================================
# - Ventana flotante: overlay 'fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm'
#   con ventana blanca (h-[95vh], rounded-2xl, shadow-2xl). Es la ÚNICA excepción
#   autorizada a la regla de cero modales. Los modales internos (cobro, ticket
#   térmico, autorización, espera) son hermanos del overlay, no hijos de la ventana.
# - Salida: botón "Salir de Caja / Volver" (router.back(), fallback /inventario).
# - Barra de caja: solo Turno/Arqueo, En Espera y Reimprimir Ticket. PROHIBIDO
#   enlazar a "Administración CXC" ni mostrar avisos de cobranza/deuda en el POS.
# - Breakpoints: md+ (tablet horizontal / PC) = mostrador dividido 65% catálogo /
#   35% ticket; <md (teléfono) = catálogo a ancho completo, cabecera fiscal plegable
#   ("Editar"), mini-ticket inferior (ítems, último producto, total $/Bs.) y bottom
#   sheet con el ticket. El ticket es un único JSX (panelTicket) reutilizado.
# - Scroll: el panel izquierdo es 'flex flex-col h-full overflow-hidden'. Cabecera
#   fija (documento fiscal, buscador [F2], chips) con 'shrink-0'; SOLO el catálogo
#   ('flex-1 overflow-y-auto min-h-0') hace scroll. Nunca reintroducir scroll global.
# - Catálogo lineal denso (no tarjetas): Foto | Nombre y presentación | SKU |
#   Categoría | Precio USD | Precio Bs. | Stock (7 columnas desde xl; en paneles más
#   angostos el SKU va bajo el nombre). Fila completa clickeable; stock > 3 badge
#   verde, <= 3 naranja; sin stock = fila atenuada y deshabilitada.
# - Atajos: F2 buscar, F8 retener, F12 cobrar (ticket con >= 1 producto), Esc cierra
#   modal abierto -> borra búsqueda -> sale de la caja.
# - Clientes: al ingresar una cédula/RIF inexistente se muestra el indicador verde
#   "Nuevo Cliente"; al procesar la venta se guarda en el directorio (duna_clientes:
#   cedula, nombre, telefono, direccion, fechaRegistro) y se autocompleta después.
# - "Consumidor Final" (SENIAT): autocompleta V-00000000, "Consumidor Final",
#   +58 4120000000 y "Retiro en tienda física" y NO se registra en el directorio.
#   Solo para ventas sin factura a nombre del cliente; si el cliente solicita sus
#   datos fiscales, se registran los reales.
# - Pago Móvil, roles separados y reactivo: el CAJERO (modal de cobro, h-auto max-h-[90vh]
#   overflow-hidden, sin scroll) NO ve datos bancarios; solo Total (Bs./USD), botón
#   "Enviar Link de Pago por WhatsApp" (crea el token en duna_pagos_pendientes y abre
#   wa.me con /pago/[token]), indicador "Esperando el reporte del cliente..." y los
#   campos N° de referencia + banco emisor, editables a mano. Un listener en tiempo
#   real (escucharDocumento) autocompleta esos campos una sola vez cuando el cliente
#   reporta. El CLIENTE (/pago/[token]) ve los datos receptores en grid 2x2 con "Copiar
#   Todo" (una línea por dato: Banco, Teléfono, Cédula / RIF, Monto Exacto) y copia
#   individual por campo; los datos viajan dentro del propio pago. Pulsa "Reportar Pago" (status REPORTADO).
#   PROHIBIDO subir capturas/comprobantes: se valida solo por referencia + banco emisor.
# - Motor transaccional Adonis (NO alterar sin orden expresa): catálogo desde
#   GET /products/store/47 + stock real con Promise.allSettled a /product/{id}/web;
#   cobro POST multipart a /delivery/request/purchase/web (service "PICKUP");
#   descuento de stock en memoria al recibir code === 1. PROHIBIDO leer productos o
#   stock desde Firestore en el POS.
# - Estética: fondo blanco, bordes slate-200, font-mono en números/montos/códigos,
#   acento naranja #FE6712 en acciones primarias.
# ==============================================================================

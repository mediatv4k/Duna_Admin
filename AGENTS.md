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
# - Barra de caja: solo Turno/Arqueo, En Espera y Reimprimir Ticket. PROHIBIDO
#   enlazar a "Administración CXC" u otras rutas de backoffice desde la caja.
# - Layout responsivo: en lg+ dual 65% catálogo / 35% ticket; en <lg el catálogo
#   ocupa el 100%, con barra inferior fija (ítems + total $/Bs. + "Ver Ticket / Cobrar")
#   y bottom sheet con el ticket. El ticket es un único JSX (panelTicket) reutilizado.
# - Scroll: el panel izquierdo es 'flex flex-col h-full overflow-hidden'. Cabecera
#   fija (documento fiscal, buscador [F2], chips) con 'shrink-0'; SOLO el catálogo
#   ('flex-1 overflow-y-auto min-h-0') hace scroll. Nunca reintroducir scroll global.
# - Catálogo lineal denso (no tarjetas): Foto | Nombre y presentación | Código/SKU |
#   Categoría | Precio USD | Precio Bs. | Stock. Fila completa clickeable; stock > 3
#   badge verde, <= 3 naranja; sin stock = fila atenuada y deshabilitada.
# - Atajos: F2 buscar, F8 retener, F12 cobrar (ticket con ≥ 1 producto), Esc cierra
#   modal abierto -> borra búsqueda -> sale de la caja (router.back / /inventario).
# - "Consumidor Final" (SENIAT): autocompleta V-00000000, "Consumidor Final",
#   +58 4120000000 y "Retiro en tienda física". Solo para ventas sin factura a
#   nombre del cliente; si el cliente solicita sus datos fiscales, se registran los reales.
# - Motor transaccional Adonis (NO alterar sin orden expresa): catálogo desde
#   GET /products/store/47 + stock real con Promise.allSettled a /product/{id}/web;
#   cobro POST multipart a /delivery/request/purchase/web (service "PICKUP");
#   descuento de stock en memoria al recibir code === 1. PROHIBIDO leer productos o
#   stock desde Firestore en el POS.
# - Estética: fondo blanco, bordes slate-200, font-mono en números/precios/códigos,
#   acento naranja #FE6712 en acciones primarias.
# ==============================================================================

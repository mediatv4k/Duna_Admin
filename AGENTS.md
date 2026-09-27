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

# ==============================================================================
## PORTAL DE COMERCIOS (/comercios/*)
# ==============================================================================
# - Aislamiento: /comercios/* es un módulo separado del ERP interno. No importa
#   src/lib/firebase.js ni el AuthContext/duna_user del ERP. Sesión propia en
#   localStorage: "iac_store" (token Bearer) y "ud_store" (JSON del usuario/comercio),
#   gestionados por src/lib/commerceServices.js (tokenComercio, loginComercio,
#   iniciarSesionComercio, obtenerTokenComercio, obtenerUsuarioComercio,
#   cerrarSesionComercio). AuthGate/CintilloTop/ManualDrawer excluyen esta ruta
#   (un `if`/condición por componente; no se duplica lógica de layout).
# - Backend: exclusivamente https://dev.carjos-marketplace.cloud, header
#   apiKey (bf8f1b64-6342-48c5-af05-501e4c15a6cb, o
#   process.env.NEXT_PUBLIC_SERVER_API_KEY si está definida) + Authorization:
#   Bearer <iac_store> en los endpoints autenticados. Solo v2: /product,
#   /product/:id, /store/:storeId/products/all, /store/:storeId/products/batch/v2,
#   /store/:storeId/payment/info, /store, /user/:user/image/upload. PROHIBIDO
#   tocar endpoints v1 legados de Excel.
#
# - CORRECCIÓN CRÍTICA (2026-09-27) — Migración de exportación plana a
#   /download/v2: el botón "Exportar Excel" generaba localmente (vía XLSX)
#   un archivo de 1 sola pestaña. Adonis v2 espera 11 pestañas para
#   estructurar sabores/variantes; si ese Excel plano se reimportaba por el
#   batch v2, el backend interpretaba que la tienda no tiene variantes y
#   borraba Product.metadata.variants en producción (pérdida de datos real).
#   handleExportExcel ya NO genera el archivo en el cliente: descarga el
#   Excel oficial del core, GET /store/:storeId/products/download/v2
#   (headers apiKey + Authorization: Bearer <iac_store>), respuesta binaria
#   vía .blob() + URL.createObjectURL + <a> temporal, nombre
#   `productos_${storeId}.xlsx`. Sin alert(): un fallo (HTTP no-2xx o red)
#   se muestra en un banner inline (mismo patrón que errorEdicionRapida),
#   con spinner en el botón mientras descarga. serializarSabores/
#   serializarToppings quedaron sin uso (ya no las llama nadie) pero no se
#   tocaron: solo servían a la lógica eliminada y removerlas era un cambio
#   fuera del alcance de esta corrección.
#
# - FASE 1 — Importación Excel batch v2 (src/app/comercios/productos/page.jsx,
#   src/lib/commerceServices.js): subirExcelBatchComercio acepta
#   { dryRun } como cuarto parámetro; dryRun viaja SOLO como query param
#   (?deleteMissing=&delete_missing=&dryRun=), nunca en el body multipart.
#   normalizarErroresBatch() serializa `errors:[{code,message}]` a
#   [{referencia, mensaje}], serializando mensajes-objeto para no mostrar
#   "[object Object]". Toggle "Simular (sin guardar)" junto a "Borrar no
#   incluidos"; en dryRun se aborta todo efecto posterior (sin refetch, sin PUT
#   de sincronización, sin persistir fichas de farmacia). Resultado (real o
#   simulado) se muestra en un panel inline bajo la barra de búsqueda —
#   PROHIBIDO usar alert()/modal para esto — con contadores y una tabla
#   "Producto / SKU | Mensaje" de filas omitidas/con error.
# - Ficha técnica de farmacia (9 campos: principioActivo, concentracion,
#   presentacion, laboratorio, registroSanitario, condicionVenta, cadenaFrio,
#   lote, fechaVencimiento): Adonis NO la persiste de forma confiable en
#   ningún campo del producto (metadata suelta se descarta; metadata.variants
#   vuelve siempre vacío; description con tag rompe el límite de longitud de
#   esa columna). Se guarda SOLO en localStorage, por tienda y por SKU
#   (clave `farma_metadata_${storeId}`, leerFichasFarmaciaLocal /
#   guardarFichaFarmaciaLocal / guardarFichasFarmaciaLocalMasivo). No
#   depender de que un PUT a Adonis la recuerde.
# - metadataCrudo: mapearProductoComercio guarda en cada producto local la
#   metadata cruda que devolvió Adonis (weight, volume, comandaDisplay,
#   variants y cualquier clave ajena). handleGuardarProducto, la edición
#   rápida y sincronizarMetadataFarmacia SIEMPRE fusionan sobre esa base
#   (fusionarPrecioMeta para metadata.price) en vez de reconstruir metadata
#   desde cero, para no pisar columnas que este módulo no conoce. La
#   descripción (`description`, raíz y metadata) no lleva límite artificial
#   de caracteres (se quitó el slice(0,250) y el maxLength del textarea).
#
# - FASE 2 — Edición rápida en tabla (misma page.jsx): switch de estado
#   (ACTIVE/INACTIVE) y celdas editables de precio/stock (componente
#   CeldaEditable: guarda con Enter o blur si el valor es válido y cambió,
#   Esc cancela), con actualización optimista + reversión si Adonis rechaza.
#   Micro-indicador por fila (spinner mientras guarda, check verde ~2s, X roja
#   con el mensaje si falla) vía estadoFilas: NUNCA modal, todo en la propia
#   fila. actualizarProductoComercio hace PUT /product/:id con {id, ...cambios}
#   únicamente (no reconstruye el producto completo).
#
# - FASE 3 — Selector Master de tiendas (SelectorTienda + storeIdActivo):
#   permite a un administrador ver/operar el catálogo de OTRA tienda sin
#   cerrar sesión ni tocar localStorage. storeId = storeIdActivo ?? storeIdSesion;
#   esModoMaster = true cuando difieren, mostrando la insignia "MODO MASTER".
#   Lista de tiendas: GET /store (solo apiKey, sin Bearer) vía
#   cargarTiendasComercio — forma de la respuesta NO garantizada, se busca el
#   arreglo en varias envolturas y solo se mapean id/nombre; verificar contra
#   el backend real antes de asumir su forma. Cambiar de tienda limpia
#   productos, tasa, búsqueda, filtro, errores, paneles/modales abiertos
#   (handleCambiarTienda) y deja que el useEffect de storeId dispare el
#   refetch (AbortController cancela la petición anterior). En Modo Master,
#   las escrituras (PUT/POST /product, batch v2) llevan {storeId} en el
#   payload; con la tienda de la propia sesión el payload queda idéntico a
#   como estaba antes de esta fase. Desplegable sin overlay/modal, anclado a
#   su botón (max-w-[calc(100vw-5.5rem)] para no desbordar a 320px), con
#   buscador sin acentos si hay más de 8 tiendas.
# - Header responsivo: <lg envuelve en filas (flex-wrap, sin sticky, altura
#   variable); desde lg vuelve a una sola fila de 64px sticky. Los toggles
#   ("Borrar no incluidos", "Simular") llevan shrink-0 en su pista (w-8 h-5)
#   para no comprimirse cuando el header se queda sin espacio horizontal.
#
# - FASE 4 — Subida directa de imágenes (SubidaImagen + subirImagenComercio):
#   reemplaza el input de Base64 anterior. Arrastrar/soltar o seleccionar
#   archivo (PNG/JPG/WEBP, máx. 10MB validado en cliente), vista previa
#   instantánea (blob local mientras sube, luego URL pública), progreso real
#   vía XMLHttpRequest (fetch no expone upload progress), botón Quitar, y un
#   input de URL externa como modo alterno (fallback manual). POST
#   /user/:user/image/upload, multipart, headers apiKey + Bearer <iac_store>;
#   el nombre del campo multipart NO está confirmado (se prueba "file" y
#   luego "image", recordando el que acepte) y la forma de la respuesta
#   tampoco (se busca la URL en varios campos habituales) — verificar contra
#   el backend real. Si la subida falla, el modal permanece abierto con todo
#   lo escrito (nombre, precio, descripción) y la imagen anterior intacta;
#   el aviso aparece bajo la zona de carga, nunca en un modal aparte. No
#   existen slots image1/image2 (no hay evidencia de que Adonis los soporte).
#
# - Toggle manual de estado de variantes en el modal de edición (2026-09-27):
#   sección "Disponibilidad de Variantes", independiente del nicho (no
#   confundir con "Variantes / Sabores", solo en Gastronomía & Heladería,
#   que maneja nombre+stock en metadata.variantes con "e", español). Esta
#   nueva sección lee metadata.variants (Adonis, inglés, grupos con items)
#   desde metadataCrudo, clonado en formData.metadataVariants al abrir el
#   modal (clonarVariantsAdonis, JSON.parse/stringify defensivo). Por cada
#   item se renderiza su nombre (item.name/label/title/code) y un switch
#   que solo alterna status ACTIVE/INACTIVE (handleToggleVarianteItem,
#   actualización inmutable); sin campo de stock. Si el producto no trae
#   variants, la sección no se renderiza (sin mensaje estático). Al guardar,
#   handleGuardarProducto asigna metadata.variants = formData.metadataVariants
#   (viaja completo en el PUT /product/:id, junto con el resto de metadata
#   ya fusionada vía metadataCrudo). ADVERTENCIA: esto contradice el
#   diagnóstico previo de esta bitácora ("Adonis sanitiza metadata.variants,
#   siempre vuelve vacío") — no se ha confirmado contra el backend real cuál
#   de los dos comportamientos es el actual; es posible que solo los
#   productos creados vía batch v2 con hojas de variantes traigan datos
#   reales aquí. Bug encontrado y corregido durante la implementación: el
#   bloque quedó inicialmente anidado dentro del wrapper
#   `{formData.nicho !== "General" && !esPerfilSimple && (...)}` ("Campos
#   Dinámicos por Nicho"), por lo que nunca se mostraba con nicho "General"
#   (el valor por defecto); se movió fuera de ese wrapper, como hermano
#   independiente, antes del pie del formulario.
#
# - Verificación de esta rama: `npx eslint <archivo>` + `npm run build` en
#   exit 0 (proyecto 100% JavaScript puro: sin tsconfig.json ni .ts/.tsx, por
#   lo que `tsc --noEmit` no aplica y no se usa).
# ==============================================================================

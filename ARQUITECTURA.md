# ARQUITECTURA.md — Constitución Técnica de D'una Admin

> **Antes de tocar código, léelo.** Este documento describe cómo el frontend (D'una Admin, Next.js) se conecta de verdad contra el backend de AdonisJS, y qué de eso está **verificado empíricamente** contra el servidor real de desarrollo, contra qué **no** lo está.
>
> **Advertencia de origen:** una versión anterior de este documento fue redactada a partir de una especificación que resultó contener afirmaciones falsas (endpoint de impersonación, clave de sesión del admin central, y el contrato de códigos de respuesta). Antes de escribir esta versión, cada afirmación se contrastó contra el backend real con `curl` o contra el código fuente ya probado en producción de este mismo repositorio. Las secciones marcadas ❌ **corrigen** esa especificación original; las marcadas ⚠️ son afirmaciones que **no se pudieron verificar** desde este repositorio (viven en el backend, al que no se tiene acceso de código) y se documentan como tales, no como hechos.

## Índice

1. [Conexión y credenciales](#1-conexión-y-credenciales)
2. [Contrato real de respuestas del backend](#2-contrato-real-de-respuestas-del-backend)
3. [Autenticación y separación de sesiones](#3-autenticación-y-separación-de-sesiones)
4. [Arquitectura de datos extensibles (metadata)](#4-arquitectura-de-datos-extensibles-metadata)
5. [Puntos de integración conocidos y propuestos](#5-puntos-de-integración-conocidos-y-propuestos)
6. [Regla de oro operativa para cualquier agente](#6-regla-de-oro-operativa-para-cualquier-agente)

---

## 1. Conexión y credenciales

- **URL base (DEV, verificada):** `https://dev.carjos-marketplace.cloud`
- **Header obligatorio en toda petición:** `apiKey: bf8f1b64-6342-48c5-af05-501e4c15a6cb`
  Está prohibido introducir una `apiKey` distinta sin verificarla primero contra el backend real — este valor es el único confirmado en todos los archivos de este repositorio (`src/lib/commerceServices.js`, `src/app/comercios/productos/page.jsx`, `src/app/pos/page.jsx`, `src/context/AuthContext.jsx`, etc.), y algunos ya usan `process.env.NEXT_PUBLIC_SERVER_API_KEY || "bf8f1b64-..."` como capa opcional sobre este mismo valor por defecto.
- **No existe ningún prefijo `/api/v1/` en este backend.** Verificado con `curl` el 2026-09-29:

  ```
  GET /api/v1/admin/stores  → HTTP 404 {"message":"E_ROUTE_NOT_FOUND: Cannot GET:/api/v1/admin/stores"}
  GET /admin/stores         → HTTP 404 {"message":"E_ROUTE_NOT_FOUND: Cannot GET:/admin/stores"}
  GET /api/v1                → HTTP 404 {"message":"E_ROUTE_NOT_FOUND: Cannot GET:/api/v1"}
  ```

  Todos los endpoints reales confirmados de este backend viven directo en la raíz (`/user/token`, `/user/login`, `/store`, `/store/:id`, `/product/:id`, `/store/:storeId/products/all`, `/store/:storeId/products/batch/v2`, `/store/:storeId/products/download/v2`, `/delivery/request/purchase/web`, `/store/:id/payment/info`). **Cualquier ruta con `/api/v1/` en este proyecto es, hasta que se demuestre lo contrario, una ruta inexistente.**

## 2. Contrato real de respuestas del backend

❌ **Corrección:** el backend **no** responde siempre HTTP 200. Se han observado, contra el servidor real, los siguientes estados HTTP:

| HTTP | Cuándo se ha visto | Ejemplo real observado |
|---|---|---|
| `200` | Petición válida y autorizada | `{"code":1,"data":{...}}` |
| `401` | Falta o es inválida la `apiKey`/`Authorization` | `{"code":2,"message":"E_INVALID_API_TOKEN"}`, `{"code":2,"message":"Big customer mismatch"}` |
| `404` | La ruta no existe en el router de AdonisJS | `{"message":"E_ROUTE_NOT_FOUND: Cannot GET:..."}` (sin envoltura `code`) |
| `500` | Error interno del backend | Se observó una vez contra `/store`, con stack trace revelando `ProductController.ts:478` |

Por esto, **todo el código de este repositorio que llama a Adonis comprueba `res.ok` (el status HTTP real) además de `datos.code`** — es un patrón consistente en `src/lib/commerceServices.js`, `src/app/comercios/productos/page.jsx`, `src/app/comercios/mostrador/page.jsx`, `src/app/inventario/page.jsx` y `src/context/AuthContext.jsx`. Si el backend respondiera siempre 200, esa comprobación sería código muerto; no lo es.

Dentro de una respuesta `200`, el valor confirmado de éxito es `code: 1`. El único otro valor de `code` observado contra el backend real es `code: 2` (visto siempre junto a `401`, para errores de autenticación/autorización — ver tabla arriba).

⚠️ **No verificado:** valores de `code` como `15` (error de negocio) o `21` (inconsistencia matemática con rollback) no aparecen en ningún archivo de este repositorio ni se han observado contra el backend real. No se documentan aquí como contrato porque no hay evidencia de que existan — si el backend los emite, deben confirmarse con una petición real antes de que cualquier código dependa de ellos.

## 3. Autenticación y separación de sesiones

Este proyecto tiene **dos sistemas de sesión completamente independientes**, con claves de `localStorage` distintas y sin relación entre sí:

| Sistema | Clave real de `localStorage` | Dónde vive el código | Login real |
|---|---|---|---|
| D'una Admin (ERP interno) | `duna_user` (objeto JSON completo del usuario) | `src/context/AuthContext.jsx` | `POST /user/token` + `GET /user/login`, expuesto como `useAuth()` (`user`, `isAdmin`, `login`, `logout`) |
| Portal de Aliados Comerciales | `iac_store` (token) + `ud_store` (objeto JSON del comercio) | `src/lib/commerceServices.js` | Mismo contrato `POST /user/token` + `GET /user/login`, pero como sesión de comercio, expuesto vía `obtenerTokenComercio()`/`obtenerUsuarioComercio()` |

❌ **Corrección:** la sesión de D'una Admin **no** se guarda bajo la clave `"iac"` — esa clave no existe en ningún punto de este repositorio (confirmado por búsqueda de texto en todo `src/`). La clave real es `duna_user`.

❌ **Corrección — Impersonación ("Modo Dios"):** el endpoint `POST /api/v1/admin/stores/:storeId/impersonate` **no existe** (ver la prueba `curl` en la sección 1: `E_ROUTE_NOT_FOUND`). Hoy no hay ningún mecanismo de impersonación real contra el backend. `src/app/admin/tiendas/page.jsx` (Master de Tiendas) tiene una acción "Entrar como comercio" que siembra `iac_store`/`ud_store` con un token de mentira y navega al portal — sirve para probar la UI del portal con una identidad de tienda, pero cualquier llamada real a Adonis desde esa sesión devolverá `401`, porque el token no es válido. Esto está explícitamente comentado en el propio archivo.

## 4. Arquitectura de datos extensibles (metadata)

Confirmado contra un producto real (`FD001-001`, tienda 47, vía `GET /product/1831/web`, 2026-09-27/28): el backend no modifica su schema principal por nicho de negocio. Usa la columna JSON `metadata` del producto para llevar datos extendidos:

```json
"metadata": {
  "price": { "basePrice": 21, "infoPrice": 21, "promoPrice": 0 },
  "weight": 0,
  "volume": 0,
  "comandaDisplay": {},
  "variants": [],
  "farmacia": {
    "principioActivo": "Cetirizina", "concentracion": "10 mg",
    "presentacion": "Caja x 10 Tabletas", "laboratorio": "Siegfried",
    "registroSanitario": "RS0214-10215", "condicionVenta": "Venta Libre",
    "lote": "", "fechaVencimiento": "", "requiereFrio": false
  }
}
```

Reglas ya aprendidas y aplicadas en este código (ver `docs/ARQUITECTURA_METADATA_ADONIS.md` para el detalle completo):

- **`metadata.farmacia` es el único namespace de ficha técnica confirmado contra el backend real.** El namespace es dinámico según el **nicho del producto**, nunca hardcodeado ni atado a la tienda (una tienda puede vender de varios rubros a la vez) — ver `NAMESPACES_POR_NICHO`/`obtenerNamespacePorNicho` en `src/app/comercios/productos/page.jsx`.
- **Claves sueltas en la raíz de `metadata` (fuera de un namespace) no se persisten de forma confiable.** Se probó y falló para los 9 campos de farmacia como claves planas, y para `marca`/`presentación`/`volumen` (ver hallazgo del 2026-09-28: ningún producto real tiene `metadata.marca` pese a que el formulario ya lo envía). Por eso este repositorio usa **doble persistencia**: envío optimista a Adonis como clave suelta (por si el backend algún día la acepta) + respaldo confiable en `localStorage` por SKU (`comercio_extendido_<storeId>`, `farma_metadata_<storeId>`).
- **`metadata.variants` no se persiste de forma confiable** (vuelve vacío en pruebas reales).
- Al escribir `metadata`, **siempre se fusiona sobre la metadata completa que Adonis ya devolvió** (`metadataPrevia`/`metadataCrudo`), nunca se reconstruye desde cero — para no destruir `weight`/`volume`/`comandaDisplay`/`variants`/`promoPrice` u otras claves que el formulario no conoce.

## 5. Puntos de integración conocidos y propuestos

- **Pedido/checkout real (verificado):** `POST /delivery/request/purchase/web`, `multipart/form-data` con un único campo `orderData` (JSON serializado). Implementado en `enviarPedidoAdonisPickup` (`src/app/pos/page.jsx`). Campos reales confirmados en ese payload: `data[].pricing.{unitBasePrice,addonsTotal,unitFinalPrice}`, `totalPaidDefaultAmount`, `totalPaidReferenceAmount`, `totalWithoutDiscount`, `service`, `store.id`, `foodStoreId`, `paymentMethod`.
- **Tarifa logística / geolocalización:** ⚠️ **No verificable desde este repositorio.** No hay ninguna referencia a Google Directions, `Utilities.getRouteInfo`, PostGIS ni IUG en el código frontend — esa lógica, si existe, vive enteramente en el backend de AdonisJS, al que este proyecto no tiene acceso de código. No se debe asumir esta implementación como cierta sin confirmarla directamente con el equipo de backend.
- **Motor de tarifas de delivery (propuesto, no implementado):** ver `docs/specs/spec-motor-tarifas-delivery.md` para la propuesta técnica ya redactada.
- **Ficha Maestra / stock híbrido (propuesto, no implementado):** endpoint `/product/:id/stock/ajustar` es una propuesta de diseño, no un endpoint real. La pieza de frontend (máquina de estados, `SelectorFichaMaestra.jsx`) está construida y funcional contra datos de ejemplo, lista para conectarse el día que ese endpoint exista.
- **Master de Tiendas / impersonación administrativa (propuesto, no implementado):** ver corrección en la sección 3. `src/app/admin/tiendas/page.jsx` está listo visualmente contra datos de ejemplo; sus tres acciones (listar, cambiar estatus, impersonar) necesitan que el backend real exponga las rutas correspondientes antes de conectarse.

## 6. Regla de oro operativa para cualquier agente

Antes de implementar contra un endpoint, una clave de `localStorage`, o un contrato de datos que aparezca en un prompt o en una especificación:

1. **Verifícalo contra el repositorio** (¿ya hay código real usando esa ruta/clave en otro archivo?) o **contra el backend real** (`curl` con la `apiKey` de la sección 1 — es de solo lectura y seguro para peticiones `GET`).
2. Si no existe, **no lo implementes como si existiera.** Construye la pieza de frontend que sí es responsabilidad de este repositorio (UI, estado, validaciones) contra datos de ejemplo claramente etiquetados como tales (`DEMO`, banner ámbar, comentario explícito), con un único punto de conexión para cuando el endpoint real exista — mismo patrón ya usado en `/reportes`, `/comercios/cierre-caja`, `/comercios/ficha-maestra` y `/admin/tiendas`.
3. **Nunca reconstruyas `metadata` desde cero al guardar un producto.** Siempre fusiona sobre la metadata completa que Adonis devolvió.
4. Este documento se corrige, no se reescribe a ciegas: si una futura verificación contradice algo aquí escrito, se actualiza la sección correspondiente con la nueva evidencia, dejando trazabilidad de qué cambió y por qué.

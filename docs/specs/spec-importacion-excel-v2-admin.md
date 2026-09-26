# Especificación Técnica: Importador Excel v2 y Gestión de Catálogo en Duna Admin

## 1. Alcance
- Integración con el endpoint v2 de carga masiva: `POST /store/:storeId/products/batch/v2`.
- Soporte para parámetros de URL: `deleteMissing=true|false` y `dryRun=true|false`.
- Manejo resiliente de respuestas atómicas y granularidad de errores por SKU/fila (`errors: [{code, message}]`).
- Panel inline para previsualización (simulación) y resultados de importación real.

## 2. No-Goals
- No alterar endpoints legacy v1 (`/products/batch`, `/products/download`).
- No modificar endpoints individuales de producto (`POST /product`, `PUT /product/:id`).
- No intervenir el módulo de inventario local del ERP (`src/app/inventario`).

## 3. Contrato de la API
- **URL Base:** `https://dev.carjos-marketplace.cloud`
- **Headers:** `apiKey: process.env.NEXT_PUBLIC_SERVER_API_KEY || '<SERVER_API_KEY>'`, `Authorization: Bearer <iac_store | iac>`
- **Modo DryRun (?dryRun=true):**
  Respuesta: `{ code: 1, dryRun: true, preview: { toCreate: [], toUpdate: [], toDelete: [] }, errors: [{code, message}] }`
- **Modo Real (?dryRun=false):**
  Respuesta: `{ code: 1, data: { processed, created, updated, deleted }, errors: [{code, message}] }`

## 4. Mapa de Columnas Excel v2
- **Hoja Productos:** F (CANTIDAD / Stock), Q (PESO kg), R (VOLUMEN dm3), S (COMANDA).
- **Hojas de Variantes:** L (COMANDA), M (STOCK de la opción).

# Especificación Técnica: Motor de Tarifas de Delivery Centralizado

> Estado: **propuesta**. Las secciones 1 a 6 y el payload de la sección 5 salen del alcance definido para esta funcionalidad; los nombres de endpoints y de roles (sección 7) son **propuestos** y deben confirmarse con el backend. Los montos de tarifa **no están definidos** y no se inventan en este documento.

## 1. Alcance
- Un único motor de tarifas de delivery, administrado de forma central por el administrador general, que aplica a todos los pedidos de delivery del marketplace.
- La tarifa se calcula en el **backend** en el momento de crear el pedido; el frontend solo la muestra.
- Componentes: aislamiento de privilegios, matriz horaria automática, switch de recargo por mal tiempo y una configuración global (`logistics_config`).

## 2. No-Goals
- Los aliados comerciales no fijan, editan ni ven la configuración de tarifas.
- No hay detección automática del clima: el recargo por mal tiempo lo activa a mano un administrador.
- No se modifica el cálculo de precios de productos ni los endpoints de catálogo (`/product`, `/store/:storeId/products/*`).
- No se recalculan pedidos ya creados: cada pedido conserva la tarifa con la que se cobró.

## 3. Aislamiento de privilegios
| Rol (propuesto) | Configuración (`logistics_config`) | Tarifa efectiva de un pedido |
|---|---|---|
| `MASTER_ADMIN` (administrador general) | Leer y escribir | Leer |
| `STORE_PARTNER` (aliado comercial) | Sin acceso | Solo lectura del monto que se le aplica |
| Cliente final | Sin acceso | Ve el desglose de su pedido |

- La autorización se valida **en el backend** con el token del usuario. Ocultar controles en la interfaz no basta.
- Cualquier escritura de un rol distinto de `MASTER_ADMIN` responde **403**.
- El portal de aliados (`/comercios/*`) no incluye ninguna pantalla de tarifas.
- Todo cambio queda auditado: quién, cuándo, valor anterior y valor nuevo.

## 4. Matriz horaria automática
La banda se determina por la hora **del servidor** al crear el pedido, en la zona horaria de la configuración (`timezone`).

| Código | Nombre | Inicio | Fin |
|---|---|---|---|
| `DAYTIME` | Diurna | 06:00 | 20:59 |
| `NIGHT` | Nocturna | 21:00 | 23:59 |
| `DAWN` | Amanecer | 00:00 | 05:59 |

- Se evalúa en minutos del día, truncando segundos: `inicio <= minuto <= fin`.
- Las bandas deben cubrir las 24 horas **sin huecos ni solapes**; el backend rechaza una configuración que no cumpla esto.
- Ninguna banda cruza la medianoche.
- Casos límite: 05:59 → `DAWN`, 06:00 → `DAYTIME`, 20:59 → `DAYTIME`, 21:00 → `NIGHT`, 23:59 → `NIGHT`, 00:00 → `DAWN`.

## 5. Configuración global: `logistics_config`
```json
{
  "logistics_config": {
    "version": 1,
    "currency": "USD",
    "timezone": "America/Caracas",
    "time_bands": [
      { "code": "DAYTIME", "label": "Diurna",   "start": "06:00", "end": "20:59", "fee_usd": null },
      { "code": "NIGHT",   "label": "Nocturna", "start": "21:00", "end": "23:59", "fee_usd": null },
      { "code": "DAWN",    "label": "Amanecer", "start": "00:00", "end": "05:59", "fee_usd": null }
    ],
    "weather_surcharge": {
      "enabled": false,
      "mode": "FIXED_USD",
      "value": 0,
      "label": "Recargo por mal tiempo"
    },
    "updated_by": null,
    "updated_at": null
  }
}
```
Reglas de validación:
- `fee_usd: null` significa "sin definir". **No se puede publicar** una configuración con algún `fee_usd` nulo; el motor no cobra hasta que las tres bandas tengan monto.
- `fee_usd >= 0` y `weather_surcharge.value >= 0`. Con `mode: "PERCENT"` el valor va de 0 a 100.
- `weather_surcharge.mode`: `FIXED_USD` (monto fijo) o `PERCENT` (porcentaje sobre la tarifa de la banda).
- `version` aumenta en cada guardado. Una escritura con una `version` desactualizada se rechaza (409), para que dos administradores no se pisen.

## 6. Recargo por mal tiempo (contingencia climática)
- Es un switch administrativo: `weather_surcharge.enabled`. Solo `MASTER_ADMIN` puede cambiarlo.
- Mientras está activo se suma a **todos** los pedidos nuevos, sin importar la banda ni el comercio.
- Se muestra al cliente como una línea aparte con la etiqueta `label`, nunca mezclado en la tarifa base.
- Activarlo o desactivarlo no altera pedidos ya creados.

Cálculo de la tarifa de un pedido:
```
banda           = resolver_banda(ahora_en(timezone))
tarifa_base     = time_bands[banda].fee_usd
recargo_clima   = enabled ? (mode == "FIXED_USD" ? value : tarifa_base * value / 100) : 0
tarifa_total    = tarifa_base + recargo_clima
```
Cada pedido guarda un snapshot para trazabilidad:
```json
{
  "band": "NIGHT",
  "base_fee_usd": 0,
  "weather_surcharge_usd": 0,
  "total_fee_usd": 0,
  "config_version": 1,
  "computed_at": "2026-01-01T21:30:00-04:00"
}
```
(Los ceros del snapshot son ilustrativos.)

## 7. Contrato de la API (propuesto, a confirmar con backend)
- **URL base:** `https://dev.carjos-marketplace.cloud`
- **Headers:** `apiKey: process.env.NEXT_PUBLIC_SERVER_API_KEY || '<SERVER_API_KEY>'`, `Authorization: Bearer <token del usuario>`

| Método y ruta (propuesta) | Quién | Efecto |
|---|---|---|
| `GET /logistics/config` | `MASTER_ADMIN` | Devuelve `logistics_config` completo |
| `PUT /logistics/config` | `MASTER_ADMIN` | Guarda la configuración completa (aplica las validaciones de la sección 5) |
| `PATCH /logistics/config/weather-surcharge` | `MASTER_ADMIN` | Cambia solo el switch y sus valores |
| Cálculo dentro de la creación del pedido | Backend | Aplica banda y recargo, y guarda el snapshot |

## 8. Criterios de aceptación
- Los seis casos límite de la sección 4 devuelven la banda indicada.
- Una escritura de `STORE_PARTNER` o de cliente responde 403 y no modifica nada.
- Con `weather_surcharge.enabled = true`, un pedido nuevo suma el recargo; uno anterior no cambia.
- Una configuración con huecos o solapes en las bandas, o con `fee_usd` nulo, se rechaza con un mensaje que indica la banda y el campo.
- Cada cambio de configuración deja un registro de auditoría con usuario, fecha, valor anterior y nuevo.

## 9. Supuestos y preguntas abiertas
- **Zona horaria:** se asume `America/Caracas` (UTC-4, sin horario de verano).
- **Moneda:** se asume USD; la conversión a bolívares seguiría usando la tasa de la tienda (`referenceRateValue`).
- **Significado de `fee_usd`:** se asume un monto fijo por banda. Si en realidad es un multiplicador sobre una tarifa por distancia o zona ya existente, el campo y la fórmula cambian.
- **Modo del recargo:** se propone `FIXED_USD` y `PERCENT`; falta confirmar cuál se usará.
- **Roles:** los nombres `MASTER_ADMIN` y `STORE_PARTNER` son propuestos. Hoy el portal de aliados no tiene un campo de rol confirmado en la sesión (`ud_store`).
- **Excepciones por comercio:** no se contemplan tarifas distintas por tienda; confirmar que no hacen falta.
- **Endpoints:** las rutas de la sección 7 no existen en este repo ni consta que existan en el backend.

# Especificación Técnica: Motor de Tarifas de Delivery Centralizado

> Estado: **reglas de negocio cerradas** (sección 9). El contrato de API y los nombres de roles (secciones 3 y 7) siguen siendo **propuestos** y deben confirmarse con el backend.

## 1. Alcance
- Una capa de **recargos porcentuales** que se aplica sobre la tarifa base de delivery que Adonis ya calcula por distancia/kilometraje (`Tarifa_Adonis`).
- Un único motor, administrado de forma central por el administrador general, que aplica a todos los pedidos de delivery de la plataforma.
- El recargo se calcula en el **backend** al crear el pedido; el frontend solo lo muestra.
- Componentes: aislamiento de privilegios, matriz horaria automática, switch de recargo por mal tiempo y una configuración global (`logistics_config`).

## 2. No-Goals
- Este motor **no calcula ni modifica la tarifa base**: la recibe ya resuelta desde Adonis.
- Ningún comercio tiene tarifas ni porcentajes propios: no existen excepciones por tienda.
- Los aliados comerciales no fijan, editan ni ven la configuración de tarifas.
- No hay detección automática del clima: el recargo por mal tiempo lo activa a mano un administrador.
- No se modifica el cálculo de precios de productos ni los endpoints de catálogo (`/product`, `/store/:storeId/products/*`).
- No se recalculan pedidos ya creados: cada pedido conserva el recargo con el que se cobró.

## 3. Aislamiento de privilegios
| Rol (propuesto) | Configuración (`logistics_config`) | Recargo aplicado a un pedido |
|---|---|---|
| `MASTER_ADMIN` (administrador general) | Leer y escribir | Leer |
| `STORE_PARTNER` (aliado comercial) | Sin acceso | Solo lectura del monto que se le aplica |
| Cliente final | Sin acceso | Ve el desglose de su pedido |

- La autorización se valida **en el backend** con el token del usuario. Ocultar controles en la interfaz no basta.
- Cualquier escritura de un rol distinto de `MASTER_ADMIN` responde **403**.
- El portal de aliados (`/comercios/*`) no incluye ninguna pantalla de tarifas.
- Todo cambio queda auditado: quién, cuándo, valor anterior y valor nuevo.

## 4. Matriz horaria automática
La banda se determina por la hora **del servidor** al crear el pedido, en la zona horaria `America/Caracas`.

| Código | Nombre | Inicio | Fin | Recargo sobre la tarifa base | ¿Editable? |
|---|---|---|---|---|---|
| `DAYTIME` | Diurna | 06:00 | 20:59 | 0 % (factor 1.0) | No: siempre 0 |
| `NIGHT` | Nocturna | 21:00 | 23:59 | +20 % (valor inicial de ejemplo) | Sí |
| `DAWN` | Amanecer | 00:00 | 05:59 | +40 % (valor inicial de ejemplo) | Sí |

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
      { "code": "DAYTIME", "label": "Diurna",   "start": "06:00", "end": "20:59", "surcharge_percent": 0 },
      { "code": "NIGHT",   "label": "Nocturna", "start": "21:00", "end": "23:59", "surcharge_percent": 20 },
      { "code": "DAWN",    "label": "Amanecer", "start": "00:00", "end": "05:59", "surcharge_percent": 40 }
    ],
    "weather_surcharge": {
      "enabled": false,
      "percent": 25,
      "label": "Recargo por mal tiempo"
    },
    "updated_by": 1,
    "updated_at": "2026-01-01T00:00:00-04:00"
  }
}
```
Los porcentajes de `NIGHT`, `DAWN` y `weather_surcharge` son los valores iniciales de ejemplo; el administrador general puede cambiarlos.

Reglas de validación:
- `DAYTIME.surcharge_percent` es siempre `0`; cualquier otro valor se rechaza.
- `surcharge_percent` de `NIGHT` y `DAWN`, y `weather_surcharge.percent`, van de 0 a 100 (admiten hasta 2 decimales). El tope de 100 es un límite de sanidad contra errores de tipeo.
- `currency` es siempre `USD` y `timezone` siempre `America/Caracas`; no son editables.
- No existen valores nulos: la configuración siempre trae los tres porcentajes de banda y el porcentaje de mal tiempo.
- La configuración no lleva identificador de tienda: es global a la plataforma.
- `version` aumenta en cada guardado. Una escritura con una `version` desactualizada se rechaza (409), para que dos administradores no se pisen.

## 6. Recargo por mal tiempo (contingencia climática)
- Es un switch administrativo: `weather_surcharge.enabled`. Solo `MASTER_ADMIN` puede cambiarlo y editar su `percent`.
- Mientras está activo se aplica a **todos** los pedidos nuevos, sin importar la banda ni el comercio.
- Se muestra al cliente como una línea aparte con la etiqueta `label`, nunca mezclado en la tarifa base.
- Activarlo o desactivarlo no altera pedidos ya creados.

### Cálculo
Los porcentajes se **suman y se aplican una sola vez sobre la tarifa base**; no se encadenan entre sí.
```
banda                  = resolver_banda(ahora_en("America/Caracas"))
tarifa_base            = Tarifa_Adonis            (USD, ya calculada por distancia/km)
recargo_banda_usd      = tarifa_base * banda.surcharge_percent / 100
recargo_clima_usd      = enabled ? tarifa_base * weather_surcharge.percent / 100 : 0
tarifa_total           = tarifa_base + recargo_banda_usd + recargo_clima_usd
```
Cada monto se redondea a 2 decimales (centavos de USD) antes de sumarse.

Ejemplo con una tarifa base de 10.00 USD y los porcentajes iniciales (20 %, 40 %, 25 %):

| Banda | Sin mal tiempo | Con mal tiempo |
|---|---|---|
| Diurna | 10.00 | 12.50 |
| Nocturna | 12.00 | 14.50 |
| Amanecer | 14.00 | 16.50 |

Cada pedido guarda un snapshot para trazabilidad (ejemplo: nocturno, con mal tiempo activo, tarifa base 10.00):
```json
{
  "band": "NIGHT",
  "base_fee_usd": 10.00,
  "band_percent": 20,
  "band_surcharge_usd": 2.00,
  "weather_percent": 25,
  "weather_surcharge_usd": 2.50,
  "total_fee_usd": 14.50,
  "config_version": 1,
  "computed_at": "2026-01-01T21:30:00-04:00"
}
```
Con el mal tiempo desactivado, `weather_percent` y `weather_surcharge_usd` valen `0`.

## 7. Contrato de la API (propuesto, a confirmar con backend)
- **URL base:** `https://dev.carjos-marketplace.cloud`
- **Headers:** `apiKey: process.env.NEXT_PUBLIC_SERVER_API_KEY || '<SERVER_API_KEY>'`, `Authorization: Bearer <token del usuario>`

| Método y ruta (propuesta) | Quién | Efecto |
|---|---|---|
| `GET /logistics/config` | `MASTER_ADMIN` | Devuelve `logistics_config` completo |
| `PUT /logistics/config` | `MASTER_ADMIN` | Guarda la configuración completa (aplica las validaciones de la sección 5) |
| `PATCH /logistics/config/weather-surcharge` | `MASTER_ADMIN` | Cambia solo `enabled` y `percent` del recargo por mal tiempo |
| Cálculo dentro de la creación del pedido | Backend | Toma `Tarifa_Adonis`, aplica banda y recargo, y guarda el snapshot |

## 8. Criterios de aceptación
- Los seis casos límite de la sección 4 devuelven la banda indicada.
- Con tarifa base 10.00 y los porcentajes iniciales, los seis totales de la tabla de la sección 6 coinciden exactamente.
- Una escritura de `STORE_PARTNER` o de cliente responde 403 y no modifica nada.
- Con `weather_surcharge.enabled = true`, un pedido nuevo suma el recargo; uno anterior no cambia.
- Una configuración con huecos o solapes en las bandas, con un porcentaje fuera de 0–100, o con `DAYTIME.surcharge_percent` distinto de 0, se rechaza con un mensaje que indica la banda y el campo.
- No existe forma de guardar un porcentaje o una tarifa para una tienda concreta.
- Cada cambio de configuración deja un registro de auditoría con usuario, fecha, valor anterior y nuevo.

## 9. Reglas de negocio definitivas
1. **Tarifa base preexistente:** la tarifa por distancia/kilometraje ya está resuelta en el backend de Adonis (`Tarifa_Adonis`). El motor dinámico no la calcula: actúa como una capa de recargos porcentuales sobre ella.
2. **Matriz de recargos:** Diurno (06:00 a 20:59) 0 % (factor 1.0); Nocturno (21:00 a 23:59) porcentaje adicional editable (inicial +20 %); Amanecer (00:00 a 05:59) porcentaje adicional editable (inicial +40 %).
3. **Mal tiempo / lluvia:** switch master administrativo que aplica un porcentaje adicional configurable (inicial +25 %) sobre los pedidos entrantes.
4. **Composición:** los porcentajes de banda y de mal tiempo se suman y se aplican una vez sobre la tarifa base (sección 6).
5. **Moneda y zona horaria:** USD y `America/Caracas`, fijas.
6. **Centralización:** los porcentajes son de plataforma. Ningún comercio tiene tarifas o porcentajes independientes.
7. **Sin valores nulos:** la configuración siempre define todos sus porcentajes.

Pendientes técnicos que no cambian las reglas de negocio:
- Los nombres de roles (`MASTER_ADMIN`, `STORE_PARTNER`) y las rutas de la sección 7 son propuestos; no consta que existan en el backend. Hoy el portal de aliados no tiene un campo de rol confirmado en la sesión (`ud_store`).
- Falta definir el punto de integración con `Tarifa_Adonis`: el motor recibe la tarifa base ya calculada, pero no está especificado en qué función o campo de Adonis se obtiene.

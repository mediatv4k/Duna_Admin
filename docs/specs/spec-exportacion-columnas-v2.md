# Especificación Técnica: Columnas Extendidas del Excel v2 (Exportación e Importación)

> Encargo para el equipo de backend (AdonisJS). Este documento no fue escrito contra el código del
> controlador — el repositorio del frontend (`Duna_Admin`) no tiene acceso a ese código fuente. Describe
> el contrato esperado desde el lado del frontend: qué columnas debe imprimir/leer el Excel v2 y a qué
> clave de `Product.metadata` corresponde cada una.

## 1. Contexto

El frontend (`src/app/comercios/productos/page.jsx`) generaba antes su propio Excel localmente (librería
`xlsx`, en el navegador) para el botón "Exportar Excel". Esa exportación local se **eliminó**: causaba
pérdida de datos, porque el archivo plano de 1 pestaña no traía las 11 pestañas que `POST
/store/:storeId/products/batch/v2` espera para variantes, y si ese Excel se reimportaba, el backend
interpretaba la ausencia de esas pestañas como "sin variantes" y borraba `Product.metadata.variants` en
producción.

El botón ahora descarga el archivo directo del core: `GET /store/:storeId/products/download/v2` (`.blob()`
+ descarga directa, sin generación en cliente). Pero ese endpoint, según el reporte del equipo de backend,
solo imprime las columnas básicas heredadas de gastronomía y no las 20 columnas que el exportador local sí
traía. Este documento detalla esas 20 columnas para que el backend las agregue tanto en la exportación como
en la importación.

## 2. Las 20 columnas nuevas

Van al final de la hoja principal ("Productos"), en este orden, después de las columnas base ya existentes
(`CODIGO, CATEGORIA, Categoría Interna, NOMBRE, DESCRIPCION, CANTIDAD, MINIMO, MAXIMO, IMAGEN, STATUS,
PRECIO BASE, PRECIO INFO, PRECIO PROMO, LABEL PROMO, NOTA PROMO, ORDEN, PESO, VOLUMEN`):

| # | Columna | Clave en `Product.metadata` | Tipo / formato | Nicho típico | Valor por defecto si falta |
|---|---|---|---|---|---|
| 1 | `NICHO` | `nicho` | string, uno de: `General`, `Farmacia & Salud`, `Tecnología & Hogar`, `Gastronomía & Heladería`, `Granel / Peso` | todos | `General` |
| 2 | `COSTO` | `costo` | número (USD) | todos | `0` |
| 3 | `BARCODE` | `barcode` | texto libre | todos | `""` |
| 4 | `MARCA` | `marca` | texto libre | todos | `""` |
| 5 | `PRINCIPIO_ACTIVO` | `principioActivo` | texto libre | Farmacia & Salud | `""` |
| 6 | `CONCENTRACION` | `concentracion` | texto libre (ej. "500mg") | Farmacia & Salud | `""` |
| 7 | `PRESENTACION` | `presentacion` | texto libre (ej. "Caja x 20 tabletas") | Farmacia & Salud | `""` |
| 8 | `LABORATORIO` | `laboratorio` | texto libre | Farmacia & Salud | `""` |
| 9 | `REGISTRO_SANITARIO` | `registroSanitario` | texto libre | Farmacia & Salud | `""` |
| 10 | `CONDICION_VENTA` | `condicionVenta` | string, uno de: `Venta Libre`, `Bajo Récipe` | Farmacia & Salud | `Venta Libre` |
| 11 | `CADENA_FRIO` | `cadenaFrio` | booleano — en el Excel viaja como texto `"SI"` / `"NO"` (ver §4) | Farmacia & Salud | `false` / `"NO"` |
| 12 | `LOTE` | `lote` | texto libre | Farmacia & Salud | `""` |
| 13 | `FECHA_VENCIMIENTO` | `fechaVencimiento` | fecha en formato `YYYY-MM-DD` | Farmacia & Salud | `""` |
| 14 | `MODELO` | `modelo` | texto libre | Tecnología & Hogar | `""` |
| 15 | `ESPECIFICACION_CLAVE` | `especificacionClave` | texto libre (ej. "12.000 BTU / 8GB RAM") | Tecnología & Hogar | `""` |
| 16 | `VOLTAJE` | `voltaje` | string, uno de: `110V`, `220V`, `Bi-voltaje` | Tecnología & Hogar | `110V` |
| 17 | `CONDICION` | `condicion` | string, uno de: `Nuevo`, `Refurbished`, `Usado` | Tecnología & Hogar | `Nuevo` |
| 18 | `MESES_GARANTIA` | `mesesGarantia` | número entero | Tecnología & Hogar | `0` |
| 19 | `AREA_DESPACHO` | `areaDespacho` | string, uno de: `Cocina`, `Barra`, `Empaque` | Gastronomía & Heladería | `Cocina` |
| 20 | `UNIDAD_MEDIDA` | `unidadMedida` | string, uno de: `kg`, `gr`, `lt`, `un` | Granel / Peso | `kg` |

**Nota de nombres parecidos:** `CONDICION_VENTA` (#10) y `CONDICION` (#17) son campos distintos y no
relacionados — el primero es la regulación de venta de un producto farmacéutico, el segundo es el estado
físico de un producto tecnológico (nuevo/usado). No unificar ni renombrar.

**Fuera de alcance de este documento:** las columnas `SABORES` y `TOPPINGS_MODIFICADORES` que también
generaba el exportador local **no** se piden aquí. Esas dos ya se gestionan a través de las 11 pestañas de
variantes del batch v2, y agregarlas como columnas planas además de las pestañas duplicaría esa
información y podría reintroducir el bug original de la Sección 1. No tocar la lógica de variantes.

## 3. `GET /store/:storeId/products/download/v2` (exportación)

Al iterar los productos de la tienda para generar la hoja "Productos", por cada producto agregar las 20
columnas de la tabla anterior, leyendo cada valor de `product.metadata.<clave>` (columna 2 de la tabla). Si
la clave no existe en `metadata` (`undefined`/`null`), usar el valor por defecto de la columna 5, no dejar
la celda vacía en un tipo que rompa el resto del reporte (ej. `COSTO` vacío en vez de `0` si otra fórmula
del Excel espera un número).

`CADENA_FRIO` se imprime como texto `"SI"` o `"NO"` (no como `TRUE`/`FALSE` ni `1`/`0`), para que el
archivo se lea igual de cómodo por una persona que lo abra en Excel manualmente. `FECHA_VENCIMIENTO` se
imprime como fecha (no como texto libre), en formato `YYYY-MM-DD`.

## 4. `POST /store/:storeId/products/batch/v2` (importación)

Al leer la hoja principal ("Productos") del Excel subido, por cada fila:

1. Para cada una de las 20 columnas de la tabla, si la columna existe en la fila (aunque sea con celda
   vacía), leer su valor y asignarlo a la clave correspondiente de `metadata` (columna 2 de la tabla) del
   producto que se está creando o actualizando.
2. Si la columna **no existe en el archivo** (el comercio subió una plantilla vieja sin estas columnas), no
   tocar esa clave de `metadata` en absoluto — nunca sobrescribir con un valor por defecto un dato que el
   producto ya tenía guardado de una importación o edición anterior. Esto es crítico: es exactamente el
   mismo tipo de bug que motivó la Sección 1 (una estructura incompleta borrando datos existentes).
3. `CADENA_FRIO`: aceptar como verdadero cualquiera de estas variantes de texto, sin distinguir
   mayúsculas/minúsculas ni tildes: `"SI"`, `"SÍ"`, `"TRUE"`, `"1"`. Cualquier otro valor (incluida celda
   vacía) se interpreta como falso.
4. `NICHO`, `CONDICION_VENTA`, `VOLTAJE`, `CONDICION`, `AREA_DESPACHO`, `UNIDAD_MEDIDA`: si el valor de la
   celda no coincide exactamente con ninguna de las opciones válidas de la columna 3, usar el valor por
   defecto de la columna 5 en vez de guardar un valor fuera de catálogo.
5. `COSTO` y `MESES_GARANTIA`: parsear como número; si no es un número válido, usar `0`.
6. **No alterar la lectura de las 10 pestañas de variantes.** Estas 20 columnas viven únicamente en la hoja
   "Productos"; el mapeo de variantes (nombres de hoja, columnas de sabores/tallas, precios y stock por
   opción) es independiente y no debe modificarse por este cambio.

## 5. Advertencia — contradice un diagnóstico anterior de estos mismos 9 campos

Las columnas 5 a 13 de la tabla (`PRINCIPIO_ACTIVO` … `FECHA_VENCIMIENTO`, la "ficha técnica de farmacia")
son las **mismas 9 columnas** que, en una sesión anterior de este mismo frontend, el equipo reportó como
**no persistidas de forma confiable por Adonis**: un `PUT /product/:id` individual las guardaba en
`metadata` como claves sueltas, pero el backend las descartaba al leer de vuelta (`metadata.variants`
sanitizado a `[]`, y un intento de empaquetarlas dentro de `description` rompió el límite de longitud de
esa columna). Por esa razón, el frontend hoy **no** envía estos 9 campos a Adonis en absoluto: los guarda
solo en el navegador (`localStorage`, clave `farma_metadata_<storeId>`, indexado por SKU), y los prioriza
sobre cualquier valor que venga del backend al mostrar la tabla y el modal de edición.

El contexto de esta tarea afirma lo contrario: que "el sistema ya está recibiendo y almacenando
correctamente" estos atributos extendidos en `Product.metadata`. Esta especificación no puede resolver esa
contradicción — no tiene acceso al backend para comprobar cuál de los dos comportamientos es el vigente
hoy. Se recomienda que el equipo de backend confirme, antes de dar esto por cerrado, si el guardado de
estas 9 columnas específicas (a diferencia de las otras 11: `NICHO`, `COSTO`, `BARCODE`, `MARCA`, `MODELO`,
`ESPECIFICACION_CLAVE`, `VOLTAJE`, `CONDICION`, `MESES_GARANTIA`, `AREA_DESPACHO`, `UNIDAD_MEDIDA`) ya
funciona de punta a punta (`PUT`/batch v2 → `GET download/v2` → reimportación sin pérdida). Si se confirma
que sí, el frontend tiene pendiente, como tarea aparte, retirar el mecanismo de `localStorage` para esos 9
campos y volver a depender de Adonis como única fuente de verdad — no forma parte de este documento.

## 6. Verificación sugerida

- Exportar el catálogo de una tienda con productos de los 4 nichos especializados, confirmar las 20
  columnas nuevas en la hoja "Productos" con los valores correctos por nicho.
- Reimportar ese mismo archivo sin modificarlo: los productos no deben cambiar ni perder ninguna de estas
  20 columnas, ni las variantes de las otras 10 pestañas.
- Subir una plantilla vieja (sin las 20 columnas nuevas) sobre productos que ya tienen esos datos
  guardados: los datos existentes deben permanecer intactos (regla 4.2).
- Confirmar compilación exitosa de Adonis sin errores de tipado (`tsc`, o el comando equivalente del
  proyecto backend) antes de mergear.

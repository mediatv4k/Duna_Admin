# Arquitectura: `metadata` como Caballo de Troya en el Catálogo de Adonis

> Documento de respaldo técnico. Escrito el 2026-09-27 tras una investigación directa contra el backend
> real (no contra documentación de Adonis, que no existe o no es accesible desde este repositorio).
> Implementado en `src/app/comercios/productos/page.jsx`, commits `f75459c` y `539d4c6` (rama `dev`).

## 1. El principio del "Caballo de Troya"

El core de Adonis (`ProductController`) expone un esquema de producto con columnas fijas y documentadas:
`name`, `price`, `stock`, `category`, `status`, `code`, `image`, `internal_category`, `description`, etc.
Ese esquema **no tiene** columnas propias para nada específico de un rubro — ni "laboratorio" para
farmacia, ni "voltaje" para tecnología, ni "área de despacho" para gastronomía. D'una Admin gestiona
comercios de rubros muy distintos sobre el mismo backend, sin poder pedirle al equipo de Adonis una
migración de esquema por cada atributo nuevo que un comercio necesite.

La única columna del producto que es JSON libre, sin esquema fijo, es `metadata`. Todo atributo
extendido que este frontend necesita —precio V2, variantes, y ahora la ficha técnica de farmacia— viaja
**dentro de ese JSON**, no como columnas nuevas. De ahí el nombre: `metadata` es el caballo de Troya que
entra sin pedir permiso al esquema relacional, cargando dentro suyo una estructura propia que el
frontend define y el backend simplemente persiste como JSON.

**Con un matiz importante, confirmado por investigación directa (ver §4):** Adonis no trata todo el
contenido de `metadata` por igual.
- Ciertas subestructuras reconocidas (`price`, `variants`, y el objeto `farmacia` documentado aquí) se
  guardan y se devuelven intactas.
- Las claves sueltas en la raíz de `metadata` que Adonis no reconoce (por ejemplo, mandar
  `principioActivo` directo en la raíz, en vez de anidado) se descartan silenciosamente: no hay error,
  simplemente desaparecen al volver a leer el producto.
- Un intento anterior de usar `metadata.variants` como contenedor genérico para la ficha de farmacia
  falló: Adonis sanea ese arreglo y siempre lo devuelve vacío (`[]`), porque sí lo interpreta con un
  significado propio (variantes de compra reales del producto).
- Un intento de incrustar la ficha como un comentario dentro de `description` falló porque esa columna
  tiene un límite de longitud en la base de datos.

En otras palabras: el "caballo de Troya" solo funciona si su carga viaja en la forma exacta que Adonis
ya reconoce. No es una bolsa libre para cualquier JSON arbitrario — es un contrato implícito, no
documentado formalmente, que hay que descubrir por ingeniería inversa (ver §4) antes de confiar en él.

## 2. Regla de aislamiento: no mezclar rubros

**Hallazgo que obliga esta regla:** una inspección directa de la tienda 47 (`GET
/store/47/products/all`, apiKey real, 2026-09-27) mostró 42 productos donde **la misma tienda** mezcla
las categorías `FARMACIA`, `Alimentos y Bebidas` y `COSMETICOS`. Esto descarta cualquier diseño que
decida el "namespace" de metadata por **tienda** (por ejemplo, un campo `storeNiche` a nivel de
comercio): una tienda no tiene un único rubro.

**Regla:** el namespace del objeto anidado de `metadata` se decide por el **nicho del producto**
(`formData.nicho` en el formulario del Kardex — Farmacia & Salud, Tecnología & Hogar, Gastronomía &
Heladería, Granel / Peso, General), nunca por la tienda. Un producto de Farmacia y un producto de
Heladería en la misma tienda nunca deben escribir ni leer bajo el mismo namespace de metadata — de ahí
la frase de trabajo usada en esta investigación: "no podemos mezclar helados con medicinas".

Consecuencia directa: si un producto no pertenece a un nicho con namespace confirmado, **no se escribe
ningún campo de farmacia en su metadata, bajo ningún nombre.** No se rellena con un objeto vacío ni con
un namespace inventado — simplemente no se toca esa parte del payload. Verificado en el navegador: un
producto de Heladería guardado desde el Kardex no lleva ni `farmacia`, ni ningún otro namespace
relacionado, en las claves de su `metadata`.

## 3. Implementación: mapeo por `formData.nicho` y notación de corchetes

Todo vive en `src/app/comercios/productos/page.jsx`.

### 3.1. El mapa y la función selectora

```js
// Namespace del objeto anidado de metadata según el NICHO DEL PRODUCTO — nunca de la tienda.
// Solo "farmacia" está CONFIRMADO contra el backend real (ver §4). Los demás nichos no tienen
// hoy ningún grupo de campos extendidos análogo, así que no hay nombre que inventar para ellos.
const NAMESPACES_POR_NICHO = {
  "Farmacia & Salud": "farmacia",
};

function obtenerNamespacePorNicho(nicho) {
  return NAMESPACES_POR_NICHO[nicho] || null;
}
```

Extender a un nuevo rubro es agregar una entrada a este mapa — **solo** cuando exista evidencia real
(igual a la de §4) del nombre que Adonis realmente usa para ese rubro. Adivinarlo no es seguro: un
namespace inventado no se persiste (Adonis simplemente no lo reconoce y, en el peor caso, se comporta
como cualquier otra clave suelta no reconocida).

### 3.2. Escritura (`handleGuardarProducto`)

```js
const namespace = obtenerNamespacePorNicho(formData.nicho);
if (namespace) {
  metadata[namespace] = {
    ...metadataPrevia[namespace],
    principioActivo: formData.principioActivo,
    concentracion: formData.concentracion,
    presentacion: formData.presentacion,
    laboratorio: formData.laboratorio,
    registroSanitario: formData.registroSanitario,
    condicionVenta: formData.condicionVenta,
    lote: formData.lote,
    fechaVencimiento: formData.fechaVencimiento,
    requiereFrio: formData.cadenaFrio,
  };
}
```

- `metadata[namespace]` usa notación de corchetes: el nombre de la clave es una variable, no un literal
  fijo (`metadata.farmacia` habría hardcodeado el rubro).
- Se fusiona sobre `...metadataPrevia[namespace]` (lo que Adonis ya tenía guardado para ese producto),
  no sobre un objeto vacío — así no se pierde ninguna clave que Adonis devuelva y que este formulario no
  conozca o no edite en esa sesión. Mismo criterio que ya se usa para el resto de `metadata`
  (`metadataCrudo`, ver commits anteriores de esta misma rama).
- Si `namespace` es `null` (nicho sin mapeo confirmado), el bloque completo se salta: no se escribe nada.
- `formData.cadenaFrio` es el nombre interno del checkbox en el formulario (histórico, sin cambiar para
  no romper nada que ya funcione); se traduce al nombre real de Adonis, `requiereFrio`, solo en el
  momento de armar el payload de salida.

### 3.3. Lectura (`mapearProductoComercio`)

```js
const namespaceFarmacia = obtenerNamespacePorNicho(meta.nicho || "General");
const fichaAdonis = (namespaceFarmacia && meta[namespaceFarmacia]) || null;
```

`fichaAdonis` se usa como fuente de máxima prioridad para poblar los 9 campos en el estado del
producto y en el formulario de edición; por debajo quedan, como respaldo, un caché en `localStorage`
(`farma_metadata_<storeId>`, de una implementación anterior a este descubrimiento) y finalmente una
lectura flexible de variantes de nombre de columna del Excel. El respaldo de `localStorage` no se
retiró: solo hay un producto real confirmado con este esquema (§4), así que por ahora es prudente
conservar ambas fuentes en vez de depender únicamente de la nueva.

## 4. Llaves verificadas del namespace `farmacia`

Verificación directa (no documentación de terceros): `curl -H "apiKey: <clave>"
https://dev.carjos-marketplace.cloud/store/47/products/all?page=1`, 2026-09-27. De 42 productos
devueltos, **uno** (`id 1831`, `code FD001-001`, "Cetirizina 10 mg Cetral Siegfried Caja x 10
Tabletas") trae un objeto `metadata.farmacia` real:

```json
"farmacia": {
  "principioActivo": "Cetirizina",
  "concentracion": "10 mg",
  "presentacion": "Caja x 10 Tabletas",
  "laboratorio": "Siegfried",
  "registroSanitario": "RS0214-10215",
  "condicionVenta": "Venta Libre",
  "lote": "",
  "fechaVencimiento": "",
  "requiereFrio": false
}
```

| Clave | Tipo | Nota |
|---|---|---|
| `principioActivo` | string | |
| `concentracion` | string | ej. `"10 mg"` |
| `presentacion` | string | ej. `"Caja x 10 Tabletas"` |
| `laboratorio` | string | |
| `registroSanitario` | string | |
| `condicionVenta` | string | valores usados en el formulario: `"Venta Libre"`, `"Bajo Récipe"` |
| `lote` | string | vacío en el único ejemplo real disponible |
| `fechaVencimiento` | string | vacío en el único ejemplo real disponible; formato esperado `YYYY-MM-DD` |
| `requiereFrio` | boolean | **el nombre real no es `cadenaFrio`** — ese es solo el nombre histórico del campo/checkbox en el formulario interno de este frontend |

Las demás claves de la raíz de `metadata` observadas en los 42 productos de esta tienda son `price`,
`weight`, `volume`, `comandaDisplay` y `variants` — ninguna otra clave no reconocida apareció en ningún
producto.

### Límites honestos de esta evidencia

- **Es un solo producto.** No hay confirmación de que el mecanismo sea consistente para todos los
  productos de farmacia, ni de si fue esta app u otro proceso el que originalmente escribió ese objeto
  (el `updated_at` de ese producto cae dentro de la ventana de esta sesión de trabajo, pero ningún test
  automatizado de esta sesión llegó a tocar el backend real — todos usaron mocks de red).
- **La tienda 70 (FarmaDuna), mencionada como el origen histórico de este comportamiento, no pudo
  inspeccionarse.** La `apiKey` de este proyecto está anclada a un "big customer" distinto
  (`401 Big customer mismatch` en cualquier combinación de headers probada); haría falta una `apiKey`
  con acceso a ese tenant para confirmarlo ahí también.
- **No se probó qué pasa si se sube este mismo esquema vía el importador de Excel** (`POST
  /store/:storeId/products/batch/v2`, "las otras 10 pestañas" de variantes). Esta investigación se
  detuvo antes de esa prueba para no escribir datos de prueba sobre el catálogo real de producción de la
  tienda 47.

## Referencias

- `AGENTS.md` → sección `PORTAL DE COMERCIOS (/comercios/*)`: historial completo de los intentos
  fallidos anteriores (claves sueltas, `metadata.variants`, `description` con comentario) y su
  corrección al esquema de este documento.
- Commits `f75459c` (empaquetado inicial en `metadata.farmacia`) y `539d4c6` (namespace dinámico por
  nicho, esta versión) en la rama `dev`.

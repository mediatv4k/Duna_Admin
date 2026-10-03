"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Plus, RefreshCw, Store, X } from "lucide-react";

// ==============================================================================
// NUEVA TIENDA — FORMULARIO DEL MASTER DE TIENDAS (src/app/admin/tiendas/page.jsx)
// ==============================================================================
// Sección en línea dentro del Workspace (nunca un modal ni un overlay: regla 2 del CLAUDE.md). Reúne los siete
// campos esenciales de un comercio de Adonis: name, code, phone, manager, address, categories y status.
//
// Formatos comprobados el 2026-10-03 con lecturas públicas de tiendas reales (solo GET):
//   - code: slug en minúsculas con guiones («farma-duna», «morocho-grill»). Hay filas de prueba con code null.
//   - phone: dígitos con prefijo de país, 12 en Venezuela («58» + 10). El directorio trae al menos un 57, así que el
//     prefijo 58 solo se completa a un número local venezolano (10 dígitos que empiezan por 2 o 4, o 11 con el 0
//     inicial); cualquier otro se acepta únicamente si ya trae su prefijo (11 a 15 dígitos).
//   - categories: texto con las categorías separadas por comas, casi siempre el `code` UUID de cada una (alguna tienda
//     antigua mezcla ids numéricos). Se envía el `code`, y el id numérico solo si la categoría no tuviera `code`.
//   - status: OPEN, CLOSED e INACTIVE.
// Las tiendas reales también traen phoneCountryCode («VE» en todas las vistas) y keywords: no se piden aquí.
//
// GUARDADO — SIMULADO. La ruta y el verbo de creación no están confirmados y no se hace ninguna escritura de prueba
// contra el servidor, así que crear solo valida, arma el payload final, lo imprime en consola y se lo entrega al
// Master (onCrear), que lo conserva en el estado local de la página mientras siga abierta. No se agrega a la tabla del
// directorio: esa tabla es la de Adonis y una fila inventada tendría acciones (entrar como comercio, ficha
// gastronómica) sobre una tienda que no existe. El fetch real está comentado dentro de handleSubmit.

export const ID_SECCION_NUEVA_TIENDA = "seccion-nueva-tienda";

const ESTATUS_INICIALES = [
  { valor: "OPEN", etiqueta: "Abierta", clase: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { valor: "CLOSED", etiqueta: "Cerrada", clase: "bg-slate-50 text-slate-600 border-slate-200" },
  { valor: "INACTIVE", etiqueta: "Inactiva (suspendida)", clase: "bg-rose-50 text-rose-700 border-rose-200" },
];
const VALORES_INICIALES = { name: "", code: "", phone: "", manager: "", address: "", categorias: [], status: "OPEN" };
// Orden del formulario: el primer campo con error recibe el foco al intentar crear
const ORDEN_CAMPOS = ["name", "code", "phone", "manager", "address", "categorias", "status"];
const SIN_GRUPO = "Otras";
const MIN_NOMBRE = 3;
const MIN_CODIGO = 3;
const MIN_ENCARGADO = 3;
const MIN_DIRECCION = 5;
const PATRON_CODIGO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const colador = new Intl.Collator("es", { sensitivity: "base" });

const sinAcentos = (texto) => String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
// «Pizzería Ñandú Express» -> «pizzeria-nandu-express»
const slugificar = (texto) => sinAcentos(texto).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// Lo que queda del código mientras se teclea: minúsculas, sin acentos ni símbolos, espacios y guiones bajos como guion,
// sin guiones dobles ni al inicio. El guion final se respeta (sin él no se podría escribir «mi-tienda»): se quita al
// salir del campo.
const sanearCodigoEscrito = (texto) =>
  sinAcentos(texto).toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-").replace(/^-+/, "");

// Teléfono: solo dígitos. Se quita el «00» internacional y el 0 inicial de un número local; un número venezolano sin
// prefijo (códigos de área 2xx y celulares 4xx) recibe el 58. Válido: 11 a 15 dígitos (el máximo de E.164).
function normalizarTelefono(texto) {
  let digitos = String(texto ?? "").replace(/\D/g, "");
  if (digitos.startsWith("00")) digitos = digitos.slice(2);
  if (digitos.length === 11 && digitos.startsWith("0")) digitos = digitos.slice(1);
  if (digitos.length === 10 && /^[24]/.test(digitos)) digitos = `58${digitos}`;
  return { digitos, valido: digitos.length >= 11 && digitos.length <= 15 };
}

const claveDeCategoria = (categoria) => categoria.codigo || categoria.id;
const etiquetaDeEstatus = (valor) => ESTATUS_INICIALES.find((e) => e.valor === valor);

// Categorías agrupadas por su grupo (campo `super` del diccionario: «Comida», «Supermercado»…); las que no tienen
// grupo van al final, en «Otras». Dentro de cada grupo, por nombre.
function agruparCategorias(categorias) {
  const grupos = new Map();
  for (const categoria of [...categorias].sort((a, b) => colador.compare(a.nombre, b.nombre))) {
    const grupo = categoria.grupo || SIN_GRUPO;
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    grupos.get(grupo).push(categoria);
  }
  return [...grupos.entries()].sort(([a], [b]) => (a === SIN_GRUPO ? 1 : 0) - (b === SIN_GRUPO ? 1 : 0) || colador.compare(a, b));
}

// Devuelve un objeto { campo: mensaje } solo con los campos inválidos; vacío si el formulario puede enviarse.
// `ocupados` son los códigos ya registrados (en minúsculas).
function validar(valores, ocupados) {
  const errores = {};

  const nombre = valores.name.trim();
  if (!nombre) errores.name = "Escribe el nombre del comercio.";
  else if (nombre.length < MIN_NOMBRE) errores.name = `El nombre necesita al menos ${MIN_NOMBRE} caracteres.`;

  const codigo = valores.code.replace(/-+$/, "");
  if (!codigo) errores.code = "Escribe el código único de la tienda.";
  else if (codigo.length < MIN_CODIGO || !PATRON_CODIGO.test(codigo)) errores.code = `Usa minúsculas, números y guiones, con al menos ${MIN_CODIGO} caracteres (ej. farma-duna).`;
  else if (ocupados.has(codigo)) errores.code = "Ya existe una tienda con este código. Elige otro.";

  if (!valores.phone.trim()) errores.phone = "Escribe el teléfono de contacto.";
  else if (!normalizarTelefono(valores.phone).valido) errores.phone = "Teléfono no válido. Usa el formato 0412-1234567 o el número con prefijo de país (ej. 584121234567).";

  const encargado = valores.manager.trim();
  if (!encargado) errores.manager = "Escribe el nombre del encargado.";
  else if (encargado.length < MIN_ENCARGADO) errores.manager = `El nombre del encargado necesita al menos ${MIN_ENCARGADO} caracteres.`;

  const direccion = valores.address.trim();
  if (!direccion) errores.address = "Escribe la dirección del comercio.";
  else if (direccion.length < MIN_DIRECCION) errores.address = `La dirección necesita al menos ${MIN_DIRECCION} caracteres.`;

  if (valores.categorias.length === 0) errores.categorias = "Elige al menos una categoría.";
  if (!etiquetaDeEstatus(valores.status)) errores.status = "Elige el estatus inicial.";

  return errores;
}

const claseCampo = (error) =>
  `w-full px-3.5 py-2.5 bg-white border rounded-xl text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none ${
    error ? "border-rose-300 focus:border-rose-500" : "border-slate-200 focus:border-[#FE6712]"
  }`;
// Enlaza el campo con su mensaje de error (o, si no hay error, con su ayuda) para los lectores de pantalla
const describir = (id, error, ayuda) => (error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined);

function Campo({ id, etiqueta, clave, error, ayuda, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="flex items-baseline gap-1.5 mb-1 text-[10px] font-bold text-slate-500">
        <span>
          {etiqueta}
          <span aria-hidden="true" className="text-rose-500"> *</span>
        </span>
        <span aria-hidden="true" className="font-mono font-normal text-slate-400">{clave}</span>
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-[11px] font-bold text-rose-600">{error}</p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="mt-1 text-[11px] text-slate-400">{ayuda}</p>
      ) : null}
    </div>
  );
}

function ChipCategoria({ nombre, marcada, onCambiar }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" checked={marcada} onChange={onCambiar} className="peer sr-only" />
      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-[11px] font-bold text-slate-600 transition hover:border-[#FE6712] peer-checked:border-[#FE6712] peer-checked:bg-orange-50 peer-checked:text-[#FE6712] peer-focus-visible:ring-2 peer-focus-visible:ring-[#FE6712]/40">
        {marcada && <Check className="w-3 h-3" />}
        {nombre}
      </span>
    </label>
  );
}

function Dato({ titulo, valor, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-emerald-700/70">{titulo}</dt>
      <dd className={`text-xs text-slate-800 break-words ${mono ? "font-mono" : "font-bold"}`}>{valor}</dd>
    </div>
  );
}

export default function FormularioNuevaTienda({
  categorias,
  cargandoCategorias,
  errorCategorias,
  onReintentarCategorias,
  codigosExistentes,
  tiendasCreadas,
  onCrear,
  onCerrar,
}) {
  const idBase = useId();
  const seccionRef = useRef(null);
  const nombreRef = useRef(null);
  const exitoRef = useRef(null);
  const [valores, setValores] = useState(VALORES_INICIALES);
  // true desde que la persona escribe el código a mano: el nombre deja de sugerirlo
  const [codigoManual, setCodigoManual] = useState(false);
  const [tocados, setTocados] = useState({});
  const [intentado, setIntentado] = useState(false);
  // Lo último que se «creó» (payload y nombres de sus categorías); null mientras se llena el formulario
  const [resultado, setResultado] = useState(null);
  const mostrandoFormulario = resultado === null;

  // Al abrirse, la sección se acerca a la vista: el Master puede estar desplazado hacia abajo
  useEffect(() => {
    seccionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);
  // El foco va al primer campo cada vez que se muestra el formulario y a la confirmación cuando se crea la tienda
  useEffect(() => {
    if (mostrandoFormulario) nombreRef.current?.focus({ preventScroll: true });
    else exitoRef.current?.focus({ preventScroll: true });
  }, [mostrandoFormulario]);

  // Los errores se derivan de los valores en cada render; solo se muestran en los campos ya visitados o tras un intento
  const ocupados = new Set(
    [...codigosExistentes, ...tiendasCreadas.map((t) => t.code)].map((c) => String(c ?? "").toLowerCase()).filter(Boolean)
  );
  const errores = validar(valores, ocupados);
  const cantidadErrores = Object.keys(errores).length;
  const verError = (campo) => (intentado || tocados[campo] ? errores[campo] : undefined);
  const marcar = (campo) => setTocados((prev) => (prev[campo] ? prev : { ...prev, [campo]: true }));
  const cambiar = (campo, valor) => setValores((prev) => ({ ...prev, [campo]: valor }));

  const handleNombre = (e) => {
    const nombre = e.target.value;
    setValores((prev) => ({ ...prev, name: nombre, ...(codigoManual ? {} : { code: slugificar(nombre) }) }));
  };
  // Al salir del nombre, el código que se sugirió también cuenta como visitado: si choca con uno existente (o no sale
  // válido) se avisa de una vez, en vez de esperar a que la persona entre al campo o intente crear la tienda
  const handleNombreAlSalir = () => {
    marcar("name");
    if (!codigoManual && valores.code) marcar("code");
  };
  const handleCodigo = (e) => {
    const codigo = sanearCodigoEscrito(e.target.value);
    setCodigoManual(codigo !== "");
    cambiar("code", codigo);
  };
  const handleCodigoAlSalir = () => {
    setValores((prev) => ({ ...prev, code: prev.code.replace(/-+$/, "") }));
    marcar("code");
  };
  const alternarCategoria = (clave) => {
    setValores((prev) => ({
      ...prev,
      categorias: prev.categorias.includes(clave) ? prev.categorias.filter((c) => c !== clave) : [...prev.categorias, clave],
    }));
    marcar("categorias");
  };

  const reiniciar = () => {
    setValores(VALORES_INICIALES);
    setCodigoManual(false);
    setTocados({});
    setIntentado(false);
    setResultado(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (cantidadErrores > 0) {
      setIntentado(true);
      const primero = ORDEN_CAMPOS.find((campo) => errores[campo]);
      document.getElementById(`${idBase}-${primero}`)?.focus();
      return;
    }

    const payload = {
      name: valores.name.trim(),
      code: valores.code.replace(/-+$/, ""),
      phone: normalizarTelefono(valores.phone).digitos,
      manager: valores.manager.trim(),
      address: valores.address.trim(),
      categories: valores.categorias.join(","),
      status: valores.status,
    };
    const nombresPorClave = new Map(categorias.map((c) => [claveDeCategoria(c), c.nombre]));
    const categoriasNombres = valores.categorias.map((clave) => nombresPorClave.get(clave) ?? clave);

    // CREACIÓN REAL — DESACTIVADA a propósito: la ruta y el verbo para crear una tienda no están confirmados (no se
    // hizo ninguna escritura de prueba contra el servidor). Se supone un POST a una ruta TENTATIVA /store con apiKey
    // y el Bearer del administrador (useAuth().user.token, no iac_store), y que la respuesta trae el id real de la
    // tienda. Al activarla: borrar el console.log, el aviso «Simulado» de la confirmación y `tiendasCreadas` del
    // Master; volver esta función async con un estado `guardando` (botón bloqueado); mostrar en el formulario el error
    // del servidor (p. ej. un `code` repetido) y pedirle al Master que recargue el directorio para que la tienda
    // aparezca en la tabla con su id real.
    //
    // const res = await fetch(`${ADONIS_BASE}/store`, {
    //   method: "POST", // o PUT, según el contrato
    //   headers: { apiKey: ADONIS_API_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    //   body: JSON.stringify(payload),
    // });
    // if (!res.ok) throw new Error("El servidor rechazó la creación.");

    console.log("[FormularioNuevaTienda] Creación simulada, payload que se enviaría al servidor:", payload);
    onCrear({ ...payload, categoriasNombres, hora: new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }) });
    setResultado({ payload, categoriasNombres });
  };

  const idNombre = `${idBase}-name`;
  const idCodigo = `${idBase}-code`;
  const idTelefono = `${idBase}-phone`;
  const idEncargado = `${idBase}-manager`;
  const idDireccion = `${idBase}-address`;
  const idCategorias = `${idBase}-categorias`;
  const idEstatus = `${idBase}-status`;
  const idTitulo = `${idBase}-titulo`;

  const errorNombre = verError("name");
  const errorCodigo = verError("code");
  const errorTelefono = verError("phone");
  const errorEncargado = verError("manager");
  const errorDireccion = verError("address");
  const errorCategoria = verError("categorias");
  const telefono = normalizarTelefono(valores.phone);
  const ayudaTelefono = telefono.valido
    ? `Se guardará con prefijo de país: ${telefono.digitos}`
    : "Ej. 0412-1234567, o con prefijo de país (584121234567).";
  const grupos = agruparCategorias(categorias);
  const hayCategorias = categorias.length > 0;

  return (
    <section ref={seccionRef} id={ID_SECCION_NUEVA_TIENDA} aria-labelledby={idTitulo} className="scroll-mt-20 bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 text-left space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={idTitulo} className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Store className="w-4 h-4 text-[#FE6712]" /> Nueva tienda
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">
            Registra un comercio nuevo en el directorio. Por ahora el guardado es simulado: todavía no se envía a Adonis.
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar formulario de nueva tienda"
          className="shrink-0 w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {mostrandoFormulario ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {intentado && cantidadErrores > 0 && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] font-bold text-rose-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Revisa {cantidadErrores === 1 ? "el campo marcado" : `los ${cantidadErrores} campos marcados`} antes de crear la tienda.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id={idNombre} etiqueta="Nombre del comercio" clave="name" error={errorNombre}>
              <input
                ref={nombreRef}
                id={idNombre}
                type="text"
                required
                autoComplete="off"
                value={valores.name}
                onChange={handleNombre}
                onBlur={handleNombreAlSalir}
                placeholder="Ej. Farma D'una Virtual"
                aria-invalid={errorNombre ? true : undefined}
                aria-describedby={describir(idNombre, errorNombre)}
                className={claseCampo(errorNombre)}
              />
            </Campo>

            <Campo id={idCodigo} etiqueta="Código único / Slug" clave="code" error={errorCodigo} ayuda="Minúsculas, números y guiones. Se sugiere a partir del nombre.">
              <input
                id={idCodigo}
                type="text"
                required
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={valores.code}
                onChange={handleCodigo}
                onBlur={handleCodigoAlSalir}
                placeholder="farma-duna"
                aria-invalid={errorCodigo ? true : undefined}
                aria-describedby={describir(idCodigo, errorCodigo, true)}
                className={`${claseCampo(errorCodigo)} font-mono`}
              />
            </Campo>

            <Campo id={idTelefono} etiqueta="Teléfono" clave="phone" error={errorTelefono} ayuda={ayudaTelefono}>
              <input
                id={idTelefono}
                type="tel"
                required
                autoComplete="off"
                value={valores.phone}
                onChange={(e) => cambiar("phone", e.target.value)}
                onBlur={() => marcar("phone")}
                placeholder="0412-1234567"
                aria-invalid={errorTelefono ? true : undefined}
                aria-describedby={describir(idTelefono, errorTelefono, true)}
                className={claseCampo(errorTelefono)}
              />
            </Campo>

            <Campo id={idEncargado} etiqueta="Encargado / Manager" clave="manager" error={errorEncargado}>
              <input
                id={idEncargado}
                type="text"
                required
                autoComplete="off"
                value={valores.manager}
                onChange={(e) => cambiar("manager", e.target.value)}
                onBlur={() => marcar("manager")}
                placeholder="Nombre y apellido"
                aria-invalid={errorEncargado ? true : undefined}
                aria-describedby={describir(idEncargado, errorEncargado)}
                className={claseCampo(errorEncargado)}
              />
            </Campo>

            <div className="sm:col-span-2">
              <Campo id={idDireccion} etiqueta="Dirección" clave="address" error={errorDireccion}>
                <textarea
                  id={idDireccion}
                  rows={2}
                  required
                  autoComplete="off"
                  value={valores.address}
                  onChange={(e) => cambiar("address", e.target.value)}
                  onBlur={() => marcar("address")}
                  placeholder="Calle, sector y ciudad"
                  aria-invalid={errorDireccion ? true : undefined}
                  aria-describedby={describir(idDireccion, errorDireccion)}
                  className={`${claseCampo(errorDireccion)} resize-y`}
                />
              </Campo>
            </div>
          </div>

          <fieldset id={idCategorias} tabIndex={-1} aria-describedby={describir(idCategorias, errorCategoria)} className="min-w-0 space-y-2 focus:outline-none">
            <legend className="mb-1 p-0 text-[10px] font-bold text-slate-500">
              Categoría / Nicho
              <span aria-hidden="true" className="text-rose-500"> *</span>
              <span aria-hidden="true" className="ml-1.5 font-mono font-normal text-slate-400">categories</span>
            </legend>

            {cargandoCategorias ? (
              <p role="status" className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                <Loader2 className="w-4 h-4 text-[#FE6712] animate-spin" /> Cargando categorías...
              </p>
            ) : !hayCategorias ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-800">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  {errorCategorias
                    ? `No hay categorías para elegir: ${errorCategorias}`
                    : "Todavía no hay categorías cargadas, y sin ellas no se puede crear la tienda."}
                </span>
                {errorCategorias && (
                  <button
                    type="button"
                    onClick={onReintentarCategorias}
                    className="shrink-0 px-3 py-1.5 bg-white border border-amber-200 text-amber-800 rounded-lg text-[11px] font-bold hover:bg-amber-100 transition flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reintentar
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {grupos.map(([grupo, items]) => (
                  <div key={grupo}>
                    <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">{grupo}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((categoria) => {
                        const clave = claveDeCategoria(categoria);
                        return (
                          <ChipCategoria
                            key={clave}
                            nombre={categoria.nombre}
                            marcada={valores.categorias.includes(clave)}
                            onCambiar={() => alternarCategoria(clave)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-slate-400">
                  {valores.categorias.length === 0
                    ? "Elige una o varias: salen del diccionario de categorías del directorio."
                    : `${valores.categorias.length} ${valores.categorias.length === 1 ? "seleccionada" : "seleccionadas"}.`}
                </p>
              </div>
            )}
            {errorCategoria && <p id={`${idCategorias}-error`} className="text-[11px] font-bold text-rose-600">{errorCategoria}</p>}
          </fieldset>

          <div className="sm:max-w-xs">
            <Campo id={idEstatus} etiqueta="Estatus inicial" clave="status" error={verError("status")}>
              <select
                id={idEstatus}
                required
                value={valores.status}
                onChange={(e) => cambiar("status", e.target.value)}
                className={claseCampo(verError("status"))}
              >
                {ESTATUS_INICIALES.map((estatus) => (
                  <option key={estatus.valor} value={estatus.valor}>{estatus.etiqueta} · {estatus.valor}</option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-400">Los campos con <span aria-hidden="true" className="text-rose-500">*</span> son obligatorios.</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCerrar}
                className="px-3.5 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Crear tienda
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div ref={exitoRef} role="status" tabIndex={-1} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5 space-y-4 focus:outline-none">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-black text-emerald-800">
              <Check className="w-4 h-4 shrink-0" /> Tienda «{resultado.payload.name}» creada
            </p>
            <span className="px-3 py-1 rounded-lg border border-amber-200 bg-amber-50 text-[11px] font-bold text-amber-800">
              Simulado · listo para conectar con el backend
            </span>
          </div>
          <p className="text-xs text-emerald-900/80">
            El registro vive solo en esta sesión del navegador: todavía no existe en Adonis. El formulario ya arma el payload final; falta conectarlo a la ruta de creación.
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
            <Dato titulo="Código" valor={resultado.payload.code} mono />
            <Dato titulo="Teléfono" valor={resultado.payload.phone} mono />
            <Dato titulo="Encargado" valor={resultado.payload.manager} />
            <Dato titulo="Dirección" valor={resultado.payload.address} />
            <Dato titulo="Categorías" valor={resultado.categoriasNombres.join(", ")} />
            <Dato titulo="Estatus" valor={`${etiquetaDeEstatus(resultado.payload.status)?.etiqueta ?? resultado.payload.status} · ${resultado.payload.status}`} />
          </dl>
          <details className="text-xs">
            <summary className="cursor-pointer font-bold text-emerald-800">Ver el payload que se enviaría</summary>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] font-mono text-slate-700">{JSON.stringify(resultado.payload, null, 2)}</pre>
          </details>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="px-3.5 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={reiniciar}
              className="px-4 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Crear otra tienda
            </button>
          </div>
        </div>
      )}

      {tiendasCreadas.length > 0 && (
        <div className="border-t border-dashed border-slate-200 pt-4 space-y-2">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wide">Creadas en esta sesión (simulado)</h3>
          <ul className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl">
            {tiendasCreadas.map((tienda) => {
              const estatus = etiquetaDeEstatus(tienda.status);
              return (
                <li key={tienda.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-xs">
                  <span className="font-bold text-slate-800">{tienda.name}</span>
                  <span className="font-mono text-slate-400">{tienda.code}</span>
                  <span className="text-slate-500">{tienda.categoriasNombres.join(", ")}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border whitespace-nowrap ${estatus?.clase ?? ""}`}>{estatus?.etiqueta ?? tienda.status}</span>
                  <span className="text-[10px] text-slate-400">{tienda.hora}</span>
                  <span className="sm:ml-auto px-2.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-[10px] font-black text-amber-800 whitespace-nowrap">Pendiente de API</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

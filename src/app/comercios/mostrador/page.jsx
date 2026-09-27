"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Check, X, ChevronDown, Search } from "lucide-react";
import { obtenerTokenComercio, obtenerUsuarioComercio, cerrarSesionComercio } from "@/lib/commerceServices";
import MenuComercio from "@/components/comercios/MenuComercio";

// Vista aislada de este archivo (misma convención que el resto del portal: cada página trae su propia
// capa mínima contra Adonis, sin compartir funciones internas de comercios/productos/page.jsx).
const ADONIS_BASE = "https://dev.carjos-marketplace.cloud";
const ADONIS_API_KEY = process.env.NEXT_PUBLIC_SERVER_API_KEY || "bf8f1b64-6342-48c5-af05-501e4c15a6cb";

function encabezadosComercio(token) {
  return { apiKey: ADONIS_API_KEY, "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function pedirJsonComercio(url, token, opciones = {}) {
  const res = await fetch(url, { ...opciones, headers: { ...encabezadosComercio(token), ...(opciones.headers || {}) } });
  let datos = null;
  try {
    datos = await res.json();
  } catch (e) {
    datos = null;
  }
  if (!res.ok || !datos || datos.code !== 1) {
    const mensaje = typeof datos?.message === "object" ? JSON.stringify(datos.message) : datos?.message;
    throw new Error(mensaje || `Adonis respondió HTTP ${res.status}`);
  }
  return datos;
}

// GET /store/:storeId/products/all?query=&page=1
async function cargarProductosMostrador(storeId, token, signal) {
  const urlPagina = (pagina) => `${ADONIS_BASE}/store/${storeId}/products/all?query=&page=${pagina}`;
  const primera = await pedirJsonComercio(urlPagina(1), token, { signal });
  let items = primera?.data?.products?.data || [];
  const ultimaPagina = Number(primera?.data?.products?.meta?.last_page) || 1;
  for (let p = 2; p <= ultimaPagina; p++) {
    const siguiente = await pedirJsonComercio(urlPagina(p), token, { signal });
    items = items.concat(siguiente?.data?.products?.data || []);
  }
  return items;
}

// Esquema ligero: solo lo que pide esta vista. Se conserva metadataCompleta cruda (no solo "variants")
// para que, al apagar/prender un sabor, el PUT no pise weight/volume/price ni ninguna otra clave.
function mapearProductoMostrador(item) {
  const meta = item?.metadata || {};
  return {
    id: item.id,
    code: String(item.code || item.sku || item.id || ""),
    name: item.name || "Sin Nombre",
    price: Number(meta.price?.basePrice ?? item.price) || 0,
    status: item.status || "ACTIVE",
    metadataCompleta: meta,
  };
}

// PUT /product/:id — payload mínimo, tal cual lo pide el switch de disponibilidad del producto completo
async function actualizarEstadoProducto(id, status, token) {
  return pedirJsonComercio(`${ADONIS_BASE}/product/${id}`, token, { method: "PUT", body: JSON.stringify({ id, status }) });
}

// PUT /product/:id — variantes: viaja la metadata completa (no solo variants) para no destruir el resto
async function actualizarMetadataProducto(id, metadataCompleta, token) {
  return pedirJsonComercio(`${ADONIS_BASE}/product/${id}`, token, { method: "PUT", body: JSON.stringify({ id, metadata: metadataCompleta }) });
}

export default function MostradorComercioPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [comercio, setComercio] = useState(null);
  const [verificandoSesion, setVerificandoSesion] = useState(true);

  useEffect(() => {
    const t = obtenerTokenComercio();
    if (!t) {
      router.replace("/comercios/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
    setToken(t);
    setComercio(obtenerUsuarioComercio());
    setVerificandoSesion(false);
  }, [router]);

  const storeId = comercio?.entityId || comercio?.storeId || comercio?.store?.id || comercio?.comercio_id || comercio?.id || null;

  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [expandidoId, setExpandidoId] = useState(null);
  const [estadoFilas, setEstadoFilas] = useState({});
  const temporizadores = useRef({});

  useEffect(() => {
    if (!token || !storeId) return undefined;
    const controller = new AbortController();
    cargarProductosMostrador(storeId, token, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setProductos(items.map(mapearProductoMostrador));
        setError("");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error(err);
        setError(err.message || "No se pudo cargar el catálogo desde Adonis.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });
    return () => controller.abort();
  }, [token, storeId]);

  const marcarFila = (id, fase) => {
    clearTimeout(temporizadores.current[id]);
    setEstadoFilas((prev) => ({ ...prev, [id]: fase }));
    if (fase === "ok") {
      temporizadores.current[id] = setTimeout(() => {
        setEstadoFilas((prev) => {
          const copia = { ...prev };
          delete copia[id];
          return copia;
        });
      }, 1800);
    }
  };

  const handleToggleProducto = async (producto) => {
    const nuevo = producto.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
    setProductos((prev) => prev.map((p) => (p.id === producto.id ? { ...p, status: nuevo } : p)));
    marcarFila(producto.id, "guardando");
    try {
      await actualizarEstadoProducto(producto.id, nuevo, token);
      marcarFila(producto.id, "ok");
    } catch (err) {
      setProductos((prev) => prev.map((p) => (p.id === producto.id ? { ...p, status: producto.status } : p)));
      marcarFila(producto.id, "error");
      setError(`No se pudo actualizar «${producto.name}»: ${err.message || "error desconocido"}`);
    }
  };

  const handleToggleVariante = async (producto, grupoIdx, itemIdx) => {
    const variantsPrevios = producto.metadataCompleta?.variants || [];
    const variantsNuevos = variantsPrevios.map((grupo, gi) => {
      if (gi !== grupoIdx) return grupo;
      return {
        ...grupo,
        items: (grupo.items || []).map((item, ii) => {
          if (ii !== itemIdx) return item;
          return { ...item, status: item.status === "INACTIVE" ? "ACTIVE" : "INACTIVE" };
        }),
      };
    });
    const metadataNueva = { ...producto.metadataCompleta, variants: variantsNuevos };
    setProductos((prev) => prev.map((p) => (p.id === producto.id ? { ...p, metadataCompleta: metadataNueva } : p)));
    marcarFila(producto.id, "guardando");
    try {
      await actualizarMetadataProducto(producto.id, metadataNueva, token);
      marcarFila(producto.id, "ok");
    } catch (err) {
      setProductos((prev) => prev.map((p) => (p.id === producto.id ? { ...p, metadataCompleta: producto.metadataCompleta } : p)));
      marcarFila(producto.id, "error");
      setError(`No se pudo actualizar variantes de «${producto.name}»: ${err.message || "error desconocido"}`);
    }
  };

  const handleCerrarSesion = () => {
    cerrarSesionComercio();
    router.replace("/comercios/login");
  };

  const productosFiltrados = productos.filter((p) => {
    const q = busqueda.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
  });

  if (verificandoSesion) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col font-sans">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleCerrarSesion} title="Cerrar sesión" className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition border border-slate-200">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="text-sm font-black text-slate-900">Control de Mostrador</span>
              <p className="text-[11px] text-slate-400 font-medium">{comercio?.name || comercio?.nombre || "Comercio"} · Tienda #{storeId}</p>
            </div>
          </div>
        </div>
      </header>

      <MenuComercio activo="mostrador" />

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
          />
        </div>

        {error && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Cerrar aviso" className="shrink-0 text-rose-500 hover:text-rose-700"><X className="w-4 h-4" /></button>
          </div>
        )}

        {cargando ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#FE6712] animate-spin" /></div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {productosFiltrados.length === 0 ? (
              <p className="p-10 text-center text-xs text-slate-400">No se encontraron productos.</p>
            ) : (
              productosFiltrados.map((p) => {
                const variantes = p.metadataCompleta?.variants || [];
                const tieneVariantes = Array.isArray(variantes) && variantes.length > 0;
                const inactivo = p.status === "INACTIVE";
                const fase = estadoFilas[p.id];
                return (
                  <div key={p.id}>
                    <div className={`flex items-center gap-3 px-4 py-3 ${inactivo ? "bg-slate-50" : ""}`}>
                      {tieneVariantes ? (
                        <button type="button" onClick={() => setExpandidoId(expandidoId === p.id ? null : p.id)} aria-label={`Ver variantes de ${p.name}`} className="shrink-0 text-slate-400 hover:text-slate-600">
                          <ChevronDown className={`w-4 h-4 transition-transform ${expandidoId === p.id ? "rotate-180" : ""}`} />
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${inactivo ? "text-slate-400" : "text-slate-800"}`}>{p.name}</p>
                        <p className="text-[11px] text-slate-400">{p.code}</p>
                      </div>
                      <p className="text-sm font-black text-slate-900 w-20 text-right shrink-0">${p.price.toFixed(2)}</p>
                      <span className="w-4 h-4 flex items-center justify-center shrink-0" role="status" aria-live="polite">
                        {fase === "guardando" && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
                        {fase === "ok" && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                        {fase === "error" && <X className="w-3.5 h-3.5 text-rose-600" />}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!inactivo}
                        aria-label={`${inactivo ? "Activar" : "Desactivar"} ${p.name}`}
                        onClick={() => handleToggleProducto(p)}
                        disabled={fase === "guardando"}
                        title={inactivo ? "Inactivo: clic para activar" : "Activo: clic para desactivar"}
                        className={`w-10 h-6 shrink-0 rounded-full relative transition-colors disabled:opacity-60 ${inactivo ? "bg-slate-200" : "bg-[#FE6712]"}`}
                      >
                        <span className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-[2px] transition-all ${inactivo ? "left-[2px]" : "left-[18px]"}`} />
                      </button>
                    </div>

                    {expandidoId === p.id && tieneVariantes && (
                      <div className="px-4 pb-3 pl-11 space-y-2">
                        {variantes.map((grupo, gi) => (
                          <div key={gi} className="border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                            <p className="text-[11px] font-bold text-slate-700">{grupo.name || grupo.title || `Grupo ${gi + 1}`}</p>
                            {(grupo.items || []).map((item, ii) => {
                              const activo = item.status !== "INACTIVE";
                              const nombreItem = item.name || item.label || item.code || `Opción ${ii + 1}`;
                              return (
                                <div key={ii} className="flex items-center justify-between gap-2 pl-1">
                                  <span className="text-xs text-slate-700 truncate">{nombreItem}</span>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={activo}
                                    aria-label={`${activo ? "Desactivar" : "Activar"} ${nombreItem}`}
                                    onClick={() => handleToggleVariante(p, gi, ii)}
                                    disabled={fase === "guardando"}
                                    className={`w-8 h-5 shrink-0 rounded-full relative transition-colors disabled:opacity-60 ${activo ? "bg-[#FE6712]" : "bg-slate-200"}`}
                                  >
                                    <span className={`w-4 h-4 bg-white rounded-full shadow-sm absolute top-[2px] transition-all ${activo ? "left-[14px]" : "left-[2px]"}`} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>
    </div>
  );
}

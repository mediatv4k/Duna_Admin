"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Boxes, ArrowLeft, Search, RefreshCw, AlertTriangle } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";

const ADONIS_URL = "https://dev.carjos-marketplace.cloud/products/store/farma-duna";
const ADONIS_HEADERS = {
  apiKey: "bf8f1b64-6342-48c5-af05-501e4c15a6cb",
  "Content-Type": "application/json",
};

// Adonis agrupa los artículos por categoría en data.products[].data; se aplanan a una sola lista
function aplanarProductos(respuesta) {
  const grupos = respuesta?.data?.products || [];
  return grupos.flatMap((grupo) =>
    (grupo.data || []).map((item) => ({
      id: item.id,
      codigo: item.code,
      nombre: item.name,
      precio_usd: Number(item.price) || 0,
      stock: item.stock,
      categoria: item.category || item.internalCategory || "",
      outOfStock: Boolean(item.outOfStock),
      imagen: item.image,
    }))
  );
}

async function pedirPagina(pagina, signal) {
  const res = await fetch(`${ADONIS_URL}?query=&page=${pagina}`, { headers: ADONIS_HEADERS, signal });
  if (!res.ok) throw new Error(`Adonis respondió HTTP ${res.status}`);
  return res.json();
}

// Recorre todas las páginas disponibles hasta reunir el catálogo completo
async function cargarCatalogoCompleto(signal) {
  const primera = await pedirPagina(1, signal);
  let productos = aplanarProductos(primera);
  const ultimaPagina = Number(primera?.data?.meta?.last_page) || 1;

  for (let p = 2; p <= ultimaPagina; p++) {
    const siguiente = await pedirPagina(p, signal);
    productos = productos.concat(aplanarProductos(siguiente));
  }
  return productos;
}

export default function InventarioPage() {
  const { tasaBcv } = useCurrency();

  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    cargarCatalogoCompleto(controller.signal)
      .then((lista) => {
        setProductos(lista);
        setError("");
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        console.error(e);
        setError("No se pudo cargar el catálogo desde Adonis. Verifica tu conexión e intenta de nuevo.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });
    return () => controller.abort();
  }, [recarga]);

  const handleRecargar = useCallback(() => {
    setCargando(true);
    setRecarga((n) => n + 1);
  }, []);

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) => (p.nombre || "").toLowerCase().includes(q) || (p.codigo || "").toLowerCase().includes(q)
    );
  }, [productos, busqueda]);

  const formatearBs = (usd) =>
    (usd * tasaBcv).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition border border-slate-200 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-[#FE6712]" />
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Inventario & Productos</h1>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Catálogo en vivo de Farma D&apos;una (Adonis) • {productos.length} productos
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRecargar}
            disabled={cargando}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? "animate-spin" : ""}`} /> Actualizar
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FE6712] transition"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-center gap-2 text-xs font-bold text-rose-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="bg-white border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-4">Producto</th>
                  <th className="p-4">Código</th>
                  <th className="p-4">Categoría</th>
                  <th className="p-4">Precio</th>
                  <th className="p-4">Stock</th>
                  <th className="p-4">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cargando ? (
                  <tr>
                    <td colSpan="6" className="p-10 text-center text-xs text-slate-400">
                      Cargando catálogo desde Adonis...
                    </td>
                  </tr>
                ) : productosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-10 text-center text-xs text-slate-400">
                      {productos.length === 0
                        ? "No hay productos disponibles."
                        : "No se encontraron productos que coincidan con la búsqueda."}
                    </td>
                  </tr>
                ) : (
                  productosFiltrados.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {p.imagen ? (
                            /* eslint-disable-next-line @next/next/no-img-element -- miniaturas remotas de dominios variables, incompatibles con next/image sin configurar */
                            <img
                              src={p.imagen}
                              alt={p.nombre}
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 shrink-0" />
                          )}
                          <span className="font-bold text-slate-800">{p.nombre}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-500 font-medium">{p.codigo}</td>
                      <td className="p-4 text-slate-600">{p.categoria || "—"}</td>
                      <td className="p-4">
                        <span className="font-black text-slate-900 block">${p.precio_usd.toFixed(2)}</span>
                        {tasaBcv > 0 && (
                          <span className="text-[11px] text-slate-400">Bs. {formatearBs(p.precio_usd)}</span>
                        )}
                      </td>
                      <td className="p-4 font-bold text-slate-700">{p.stock ?? "—"}</td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                            p.outOfStock
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {p.outOfStock ? "Agotado" : "Disponible"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-100 text-xs text-slate-500">
            Mostrando <strong>{productosFiltrados.length}</strong> de <strong>{productos.length}</strong> productos
          </div>
        </div>
      </main>
    </div>
  );
}

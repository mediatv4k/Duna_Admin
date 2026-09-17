"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { 
  Boxes, Upload, Download, ArrowLeft, Search, 
  Plus, Edit3, Trash2, X, Check, Camera
} from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";

export default function InventarioPage() {
  const { modoMoneda, tasaBcv } = useCurrency();
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoEnEdicion, setProductoEnEdicion] = useState(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    categoria: "General",
    subcategoria: "",
    price: "",
    stock: "",
    image: "",
    descripcion: ""
  });

  useEffect(() => {
    const guardados = localStorage.getItem("duna_inventario_prods");
    if (guardados) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
        setProductos(JSON.parse(guardados));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const actualizarProductos = (nuevos) => {
    setProductos(nuevos);
    localStorage.setItem("duna_inventario_prods", JSON.stringify(nuevos));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json(ws);

        const mapeados = data
          .filter(row => row.NOMBRE || row.CODIGO)
          .map((row, idx) => ({
            id: String(row.CODIGO || `PROD-${Date.now()}-${idx}`),
            code: String(row.CODIGO || `P00${idx + 1}`),
            categoria: row.CATEGORIA || "General",
            subcategoria: row.SUBCATEGORIA || "",
            name: row.NOMBRE || "Sin Nombre",
            descripcion: String(row.DESCRIPCION || "").slice(0, 250),
            stock: Number(row.CANTIDAD) || 0,
            minimo: Number(row.MINIMO) || 1,
            maximo: Number(row.MAXIMO) || 0,
            image: row.IMAGEN || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&q=80",
            status: row.STATUS || "ACTIVE",
            price: Number(row["PRECIO BASE"]) || 0,
            precioInfo: Number(row["PRECIO INFO"]) || 0,
            precioPromo: Number(row["PRECIO PROMO"]) || 0,
            labelPromo: row["LABEL PROMO"] || "",
            notaPromo: row["NOTA PROMO"] || "",
            orden: Number(row.ORDEN) || 0,
            peso: Number(row.PESO) || 0,
            volumen: Number(row.VOLUMEN) || 0
          }));

        actualizarProductos(mapeados);
        alert(`¡Catálogo importado! Se cargaron ${mapeados.length} productos.`);
      } catch (err) {
        alert("Error al leer el archivo Excel.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  const handleExportExcel = () => {
    const dataToExport = productos.length > 0 ? productos.map(p => ({
      CODIGO: p.code,
      CATEGORIA: p.categoria,
      SUBCATEGORIA: p.subcategoria || "",
      NOMBRE: p.name,
      DESCRIPCION: p.descripcion || "",
      CANTIDAD: p.stock,
      MINIMO: p.minimo || 1,
      MAXIMO: p.maximo || 0,
      IMAGEN: p.image,
      STATUS: p.status || "ACTIVE",
      "PRECIO BASE": p.price,
      "PRECIO INFO": p.precioInfo || p.price,
      "PRECIO PROMO": p.precioPromo || 0,
      "LABEL PROMO": p.labelPromo || "",
      "NOTA PROMO": p.notaPromo || "",
      ORDEN: p.orden || 0,
      PESO: p.peso || 0,
      VOLUMEN: p.volumen || 0
    })) : [
      {
        CODIGO: "P001",
        CATEGORIA: "General",
        SUBCATEGORIA: "",
        NOMBRE: "Producto Ejemplo",
        DESCRIPCION: "Descripción oficial de 250 caracteres",
        CANTIDAD: 20,
        MINIMO: 1,
        MAXIMO: 0,
        IMAGEN: "",
        STATUS: "ACTIVE",
        "PRECIO BASE": 5.00,
        "PRECIO INFO": 5.00,
        "PRECIO PROMO": 0,
        "LABEL PROMO": "",
        "NOTA PROMO": "",
        ORDEN: 0,
        PESO: 0,
        VOLUMEN: 0
      }
    ];

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "Productos_Duna_Admin.xlsx");
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Recomendamos fotos menores a 2MB.");
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const abrirModalNuevo = () => {
    setProductoEnEdicion(null);
    setFormData({
      code: `P00${productos.length + 1}`,
      name: "",
      categoria: "General",
      subcategoria: "",
      price: "",
      stock: "",
      image: "",
      descripcion: ""
    });
    setModalAbierto(true);
  };

  const abrirModalEditar = (prod) => {
    setProductoEnEdicion(prod);
    setFormData({
      code: prod.code,
      name: prod.name,
      categoria: prod.categoria,
      subcategoria: prod.subcategoria || "",
      price: prod.price,
      stock: prod.stock,
      image: prod.image,
      descripcion: prod.descripcion || ""
    });
    setModalAbierto(true);
  };

  const handleGuardarProducto = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.price) {
      alert("Indica nombre y precio.");
      return;
    }

    const imagenFinal = formData.image.trim() || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&q=80";

    if (productoEnEdicion) {
      const actualizados = productos.map(p => {
        if (p.id === productoEnEdicion.id) {
          return {
            ...p,
            code: formData.code,
            name: formData.name,
            categoria: formData.categoria,
            subcategoria: formData.subcategoria,
            price: Number(formData.price) || 0,
            stock: Number(formData.stock) || 0,
            image: imagenFinal,
            descripcion: formData.descripcion.slice(0, 250)
          };
        }
        return p;
      });
      actualizarProductos(actualizados);
    } else {
      const nuevo = {
        id: `PROD-${Date.now()}`,
        code: formData.code || `P00${productos.length + 1}`,
        categoria: formData.categoria || "General",
        subcategoria: formData.subcategoria || "",
        name: formData.name,
        descripcion: formData.descripcion.slice(0, 250),
        stock: Number(formData.stock) || 0,
        minimo: 1,
        maximo: 0,
        image: imagenFinal,
        status: "ACTIVE",
        price: Number(formData.price) || 0,
        precioInfo: Number(formData.price) || 0,
        precioPromo: 0,
        labelPromo: "",
        notaPromo: "",
        orden: 0,
        peso: 0,
        volumen: 0
      };
      actualizarProductos([nuevo, ...productos]);
    }
    setModalAbierto(false);
  };

  const handleEliminarProducto = (id) => {
    if (confirm("¿Seguro que deseas eliminar este producto?")) {
      actualizarProductos(productos.filter(p => p.id !== id));
    }
  };

  const productosFiltrados = productos.filter(p =>
    p.name.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.categoria.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.code.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col font-sans">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-[37px] z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition border border-slate-200">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <Link href="/" className="flex items-center gap-2">
                <img src="/logo-duna-admin.png" alt="D'una Admin" className="h-8 w-auto object-contain" />
                <span className="text-[11px] bg-orange-50 text-[#FE6712] px-2.5 py-0.5 rounded-full font-bold border border-orange-200">INVENTARIO</span>
              </Link>
              <p className="text-[11px] text-slate-400 font-medium">Catálogo Oficial de 18 Columnas</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={abrirModalNuevo}
              className="px-3.5 py-2 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nuevo Producto</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <Upload className="w-4 h-4 text-[#FE6712]" />
              <span className="hidden md:inline">Subir Excel</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span className="hidden md:inline">Descargar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex-1 w-full space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por código, nombre o categoría..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 focus:outline-none focus:border-[#FE6712]"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Artículos cargados: <strong className="text-slate-900 font-bold">{productos.length}</strong>
          </div>
        </div>

        {productos.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4 shadow-sm my-8">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 text-[#FE6712] flex items-center justify-center mx-auto">
              <Boxes className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Catálogo sin productos</h3>
              <p className="text-xs text-slate-500 mt-1">Carga artículos manualmente o sube el archivo Excel de 18 columnas.</p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={abrirModalNuevo}
                className="px-5 py-2.5 bg-[#FE6712] hover:bg-[#ea580c] text-white rounded-2xl text-xs font-bold transition inline-flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Crear Manualmente
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {productosFiltrados.map((item) => {
              const precioBs = (item.price * tasaBcv).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              return (
                <div key={item.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between group">
                  <div className="aspect-video bg-slate-100 relative overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&q=80"; }}
                    />
                    <span className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-white/90 backdrop-blur text-[10px] font-black text-slate-700 border border-slate-200">
                      {item.categoria}
                    </span>
                    <span className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold">
                      Stock: {item.stock}
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.code}</div>
                      <h4 className="text-sm font-bold text-slate-900 line-clamp-1 mt-0.5">{item.name}</h4>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mt-1">{item.descripcion || "Sin descripción disponible."}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      {modoMoneda === "dual" && (
                        <div className="flex items-baseline justify-between">
                          <div>
                            <span className="text-[10px] text-slate-400 font-semibold uppercase block">Precio</span>
                            <span className="text-lg font-black text-slate-900">${item.price.toFixed(2)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase block">Tasa BCV</span>
                            <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                              Bs. {precioBs}
                            </span>
                          </div>
                        </div>
                      )}
                      {modoMoneda === "usd" && (
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase">Precio USD</span>
                          <span className="text-lg font-black text-slate-900">${item.price.toFixed(2)}</span>
                        </div>
                      )}
                      {modoMoneda === "ves" && (
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase">Precio BCV</span>
                          <span className="text-lg font-black text-emerald-700">Bs. {precioBs}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5">
                      <button onClick={() => abrirModalEditar(item)} className="p-2 rounded-xl bg-slate-100 hover:bg-orange-50 text-slate-600 hover:text-[#FE6712] transition border border-slate-200">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleEliminarProducto(item.id)} className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition border border-slate-200">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900">{productoEnEdicion ? "Editar Producto" : "Nuevo Producto"}</h3>
              <button onClick={() => setModalAbierto(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGuardarProducto} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Código</label>
                  <input type="text" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Categoría</label>
                  <input type="text" value={formData.categoria} onChange={(e) => setFormData({ ...formData, categoria: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Nombre *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Precio Base ($) *</label>
                  <input type="number" step="0.01" required value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Stock</label>
                  <input type="number" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-600 block">Imagen</label>
                <input type="file" ref={imageInputRef} onChange={handleImageFileChange} accept="image/*" className="hidden" />
                <button type="button" onClick={() => imageInputRef.current?.click()} className="px-3.5 py-2 bg-slate-100 hover:bg-orange-50 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-200">
                  <Camera className="w-4 h-4 text-[#FE6712]" /> Subir foto local
                </button>
                <input type="text" value={formData.image.startsWith("data:") ? "" : formData.image} onChange={(e) => setFormData({ ...formData, image: e.target.value })} placeholder="o URL..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs" />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                  <span>Descripción</span>
                  <span className="text-slate-400">{formData.descripcion.length} / 250</span>
                </div>
                <textarea rows="2" maxLength={250} value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none"></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalAbierto(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">Cancelar</button>
                <button type="submit" className="px-5 py-2 bg-[#FE6712] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
                  <Check className="w-4 h-4" /> Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

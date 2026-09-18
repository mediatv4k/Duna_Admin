const ADONIS_PURCHASE_URL = "https://dev.carjos-marketplace.cloud/delivery/request/purchase/web";
const ADONIS_API_KEY = "bf8f1b64-6342-48c5-af05-501e4c15a6cb";

function esProductoAdonis(p) {
  return String(p.codigo || "").toUpperCase().startsWith("FD") || String(p.id || "").includes("ADONIS");
}

// Envía a Adonis (modalidad PICKUP) los productos de la venta que provienen de su catálogo
export async function enviarVentaAdonisPickup(ventaData, productosCarrito) {
  const productosFiltrados = (productosCarrito || []).filter(esProductoAdonis);
  if (productosFiltrados.length === 0) return { exito: true, omitido: true };

  const orderData = {
    id: "",
    data: productosFiltrados.map((p) => {
      const precio = Number(p.precio_usd || p.precio);
      const cantidad = Number(p.cantidad);
      return {
        id: p.adonis_id || Number(String(p.id ?? "").replace("ADONIS-", "")) || 3534,
        code: p.codigo,
        name: p.nombre,
        cant: cantidad,
        pricing: { unitBasePrice: precio, addonsTotal: 0, unitFinalPrice: precio },
        totalPrice: precio * cantidad,
        variants: [],
        promo: null,
      };
    }),
    service: "PICKUP",
    location: { lat: 0, lng: 0 },
    duration: 0,
    distance: 0,
    durationText: "0 min",
    distanceText: "0 km",
    serviceAmount: 0,
    address: "Retiro en Farmacia (POS Mostrador)",
    phone: ventaData.clienteTelefono || "584140000000",
    customerName: ventaData.clienteNombre || "Cliente Mostrador",
    customerDocument: ventaData.clienteCedula || "V-00000000",
    ftoken: "",
    paymentRef: "PAGO-POS-MOSTRADOR",
    totalPaidReferenceAmount: String(ventaData.totalBs || "0"),
    totalPaidDefaultAmount: String(ventaData.totalUsd || "0"),
    totalWithoutDiscount: String(ventaData.totalUsd || "0"),
    paymentMethod: { code: "EFUS", value: "Efectivo USD", field4: "USD", field5: "DEFAULT" },
    tip: 0,
    store: { id: 70, phone: "04165675220" },
    foodStoreId: "70",
    couponId: null,
    couponCode: null,
    discountAmount: 0,
  };

  const formData = new FormData();
  formData.append("orderData", JSON.stringify(orderData));

  const res = await fetch(ADONIS_PURCHASE_URL, {
    method: "POST",
    headers: { apiKey: ADONIS_API_KEY, timeZone: "America/Caracas" },
    body: formData,
  });

  let cuerpo = null;
  try {
    cuerpo = await res.json();
  } catch {
    cuerpo = null;
  }

  return {
    exito: res.ok,
    codigo: cuerpo?.code ?? res.status,
    mensaje: cuerpo?.message ?? res.statusText,
    respuesta: cuerpo,
  };
}

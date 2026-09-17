// Base de conocimiento del Manual Vivo Interactivo.
// Cada artículo describe una función ya operativa de D'una Admin.

const manualData = [
  {
    id: "perfiles-negocio",
    modulo: "GENERAL",
    ruta: "/inventario",
    titulo: "Perfiles de Negocio",
    resumen: "Adapta la complejidad del catálogo según el tipo de comercio: Simple, Retail, Gastronomía o Farmacia.",
    pasos: [
      "Abre el selector de perfil (ícono de tienda) en el cintillo superior oscuro.",
      "Elige 'Simple' para un catálogo mínimo: solo Nombre, Categoría, Costo, Precio, Stock e Imagen.",
      "Elige 'Retail', 'Gastronomía' o 'Farmacia' para habilitar nicho, variantes, toppings y campos específicos en el modal de producto.",
      "El cambio se aplica de inmediato al abrir o editar un producto en Inventario.",
    ],
    tips: [
      "Cambiar a 'Simple' solo oculta los campos avanzados; no borra datos ya cargados en productos existentes.",
      "El perfil se guarda en este navegador (localStorage), útil para hacer demostraciones rápidas.",
    ],
    palabrasClave: ["perfil", "simple", "retail", "gastronomia", "farmacia", "cintillo", "negocio"],
  },
  {
    id: "variantes-sabores",
    modulo: "INVENTARIO",
    ruta: "/inventario",
    titulo: "Variantes y Sabores",
    resumen: "Carga presentaciones o sabores de un mismo producto, cada una con su propio stock e identificados por código de barras.",
    pasos: [
      "En Inventario, crea o edita un producto y selecciona el nicho 'Gastronomía & Heladería'.",
      "En 'Variantes / Sabores', pulsa '+ Añadir sabor' e ingresa el nombre (ej: Chocolate) y su stock inicial.",
      "Repite para cada sabor o presentación disponible.",
      "El stock total del producto se calcula automáticamente como la suma de todas las variantes.",
      "Al vender en CXC, el sistema pedirá elegir el sabor y descontará únicamente de esa variante.",
    ],
    tips: [
      "Si un sabor se agota, su stock queda en 0 pero permanece visible para reabastecerlo luego.",
      "El campo Código de Barras del producto identifica al artículo completo, no a cada sabor individual.",
    ],
    palabrasClave: ["variantes", "sabores", "stock", "gastronomia", "heladeria", "presentacion"],
  },
  {
    id: "toppings-modificadores",
    modulo: "INVENTARIO",
    ruta: "/inventario",
    titulo: "Toppings y Modificadores",
    resumen: "Define agregados opcionales (con o sin recargo) para productos de comida o bebida, como Nutella o canela extra.",
    pasos: [
      "Edita un producto con nicho 'Gastronomía & Heladería' o 'General'.",
      "En 'Toppings / Modificadores Opcionales', escribe el nombre del extra y su precio adicional (déjalo en 0 para que sea gratis).",
      "Pulsa 'Añadir' para agregarlo como cápsula a la lista; usa la ✕ de cada cápsula para quitarlo.",
      "Guarda el producto: los toppings quedan disponibles al venderlo en CXC.",
    ],
    tips: [
      "En la venta, los toppings se muestran como pastillas seleccionables y el total se recalcula al instante.",
      "El desglose de extras elegidos queda impreso en el ticket de cobranza por WhatsApp.",
    ],
    palabrasClave: ["toppings", "modificadores", "extras", "agregados", "recargo", "nutella"],
  },
  {
    id: "captura-escudo-clientes",
    modulo: "CXC",
    ruta: "/cxc",
    titulo: "Captura y Escudo de Clientes",
    resumen: "Detección en tiempo real de clientes existentes por cédula/RIF para evitar duplicados en el directorio.",
    pasos: [
      "En 'Nueva Venta / Factura', elige el prefijo (V-, J-, E-, G- o P-) y escribe solo los números de la cédula/RIF.",
      "Si el documento coincide con un cliente ya registrado, el campo se resalta en verde con el badge '✓ Cliente Registrado'.",
      "Nombre, Código de País, Teléfono y Dirección se autorrellenan al instante.",
      "El campo queda en modo solo lectura para proteger la clave única; usa el enlace 'Cambiar' si necesitas capturar otro cliente.",
    ],
    tips: [
      "La búsqueda compara solo dígitos, así que funciona aunque el documento tenga puntos, espacios o el prefijo distinto.",
      "Al registrar la factura, el cliente se guarda o actualiza automáticamente sin crear duplicados.",
    ],
    palabrasClave: ["cliente", "cedula", "rif", "duplicados", "escudo", "prefijo", "documento"],
  },
  {
    id: "auditoria-deuda-pos",
    modulo: "CXC",
    ruta: "/cxc",
    titulo: "Auditoría de Deuda en POS",
    resumen: "Alerta inmediata de facturas vencidas del cliente detectado, con acceso directo a cobrarlas.",
    pasos: [
      "Al capturar la cédula/RIF de un cliente con saldos pendientes, aparece un banner ámbar con el monto total adeudado y la cantidad de facturas.",
      "Pulsa 'Ver / Cobrar Facturas' para abrir el desglose completo: número, fecha, total y saldo de cada factura vencida.",
      "Desde ahí puedes 'Abonar' cualquier factura (con recálculo de saldo en vivo) o enviar el cobro por WhatsApp.",
      "Cierra el modal para continuar con la venta en curso sin perder los datos capturados.",
    ],
    tips: [
      "Si el cliente no tiene deudas, verás el badge verde '✓ Al Día' en su lugar.",
      "La deuda se muestra en dólares y su equivalente en bolívares a la tasa BCV vigente.",
    ],
    palabrasClave: ["deuda", "auditoria", "facturas vencidas", "cobranza", "saldo", "al dia"],
  },
  {
    id: "control-contado-credito",
    modulo: "CXC",
    ruta: "/cxc",
    titulo: "Control de Contado vs Crédito",
    resumen: "Define si un cliente puede quedar debiendo o si debe pagar el 100% de la factura en el momento.",
    pasos: [
      "En 'Nueva Venta / Factura', ubica el switch 'Condición de Venta'.",
      "Selecciona 'Permite Crédito' (opción por defecto) para admitir abonos parciales y saldo pendiente.",
      "Selecciona 'Solo Contado' para exigir el pago completo: el sistema fija el abono al 100% del total automáticamente.",
      "Al registrar la factura de contado, el saldo queda en $0.00 y el estado pasa directo a 'PAGADO'.",
    ],
    tips: [
      "La condición elegida se guarda en la ficha del cliente y se recuerda la próxima vez que se detecte su cédula.",
      "Aun en modo contado puedes elegir el método de pago (efectivo, pago móvil, transferencia, etc.).",
    ],
    palabrasClave: ["contado", "credito", "abono", "condicion de venta", "saldo pendiente"],
  },
  {
    id: "COMPRAS_RECEPCION",
    modulo: "COMPRAS",
    ruta: "/compras",
    titulo: "Recepción de Compras y Costo Ponderado",
    resumen: "Cómo ingresar mercancía de proveedores, alimentar el stock físico y recalcular costos automáticamente.",
    pasos: [
      "En 'Compras', busca el proveedor por RIF o razón social; si no existe, créalo con '+ Nuevo Proveedor' indicando sus días de crédito.",
      "Completa el Nº de Factura del proveedor (obligatorio), el Nº de Control Fiscal y la Fecha de Emisión: la Fecha de Vencimiento se calcula sola según los días de crédito.",
      "Elige la Condición (Contado o Crédito) para esa factura de compra.",
      "Busca cada producto del inventario, selecciona la variante si aplica, indica Cantidad y Costo Unitario, y pulsa 'Agregar Renglón'.",
      "Repite por cada artículo recibido y revisa el total antes de pulsar 'Registrar Compra'.",
    ],
    tips: [
      "Al registrar la compra, el stock del producto (o de la variante elegida) sube automáticamente y el costo se recalcula como Costo Promedio Ponderado: ((Stock Anterior × Costo Anterior) + (Cantidad × Costo Nuevo)) ÷ (Stock Anterior + Cantidad).",
      "Si la compra es a crédito, queda registrada como deuda pendiente con proveedor; si es de contado, se marca como pagada con saldo $0.00.",
      "Usa 'Ver Detalle' en el histórico para revisar los renglones exactos de cualquier compra anterior.",
    ],
    palabrasClave: ["compras", "proveedores", "costo promedio", "cpp", "recepcion", "factura de compra", "stock"],
  },
];

export default manualData;

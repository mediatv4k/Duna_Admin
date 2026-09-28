const fs = require('fs');
let content = fs.readFileSync('src/app/comercios/productos/page.jsx', 'utf8');

// 1. mapearProductoComercio
content = content.replace(
  'const namespaceFarmacia = obtenerNamespacePorNicho(meta.nicho || "General");',
  'const nichoConfigurado = typeof window !== \'undefined\' && storeId ? localStorage.getItem(store_nicho_) : null;\n  const nichoProducto = meta.nicho || nichoConfigurado || "General";\n  const namespaceFarmacia = obtenerNamespacePorNicho(nichoProducto);'
);

content = content.replace(
  'nicho: meta.nicho || "General",',
  'nicho: typeof nichoProducto !== \'undefined\' ? nichoProducto : (meta.nicho || "General"),'
);

// 2. abrirModalNuevo
content = content.replace(
  'setFormData({\n      ...FORM_INICIAL,\n      code: P00,\n    });',
  'const nichoConfigurado = typeof window !== \'undefined\' ? localStorage.getItem(store_nicho_) || "General" : "General";\n    setFormData({\n      ...FORM_INICIAL,\n      nicho: nichoConfigurado,\n      code: P00,\n    });'
);

// 3. abrirModalEditar
content = content.replace(
  'setFormData({\n      ...FORM_INICIAL,\n      ...prod,',
  'const nichoConfigurado = typeof window !== \'undefined\' ? localStorage.getItem(store_nicho_) || "General" : "General";\n    setFormData({\n      ...FORM_INICIAL,\n      nicho: nichoConfigurado,\n      ...prod,'
);

fs.writeFileSync('src/app/comercios/productos/page.jsx', content, 'utf8');
console.log('Replaced successfully');

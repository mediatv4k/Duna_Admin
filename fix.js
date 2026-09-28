const fs = require('fs');
let content = fs.readFileSync('src/app/comercios/productos/page.jsx', 'utf8');
content = Buffer.from(content, 'utf8').toString('latin1');
fs.writeFileSync('src/app/comercios/productos/page.jsx', content, 'utf8');
console.log('Fixed');

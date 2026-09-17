# Bitácora: D'una Admin (SaaS Multi-tenant)

> Sistema administrativo multi-empresa para comercialización masiva.
> Arquitectura modular: Front Page, Inventario, CXC y CXP con aislamiento de datos.

## 1. Visión Comercial
- Modelo SaaS: Cada cliente/negocio tiene su cuenta independiente.
- Lienzo en blanco por defecto: Inicia en cero al registrarse.
- Seguridad de datos: Cada registro está vinculado a un storeId único.

## 2. Roadmap Técnico
- [x] Instalación base Next.js y dependencias UI.
- [x] Base de datos local inicial en blanco.
- [ ] UI limpia con estados vacíos amigables (Empty States).
- [ ] Formulario de creación de productos, ventas y compras.
- [ ] Autenticación de usuarios (Login / Registro por comercio).
- [ ] Despliegue en la nube (Vercel).

# Pulso

Aplicación responsive para crear encuestas, compartirlas mediante enlace o QR y consultar resultados en tiempo real.

## Stack de producción

- Next.js 16 (App Router)
- Clerk para autenticación de administradores
- Neon PostgreSQL mediante su endpoint SQL HTTPS
- Vercel para hosting y funciones serverless

## Desarrollo local

1. Copia `.env.example` como `.env.local`.
2. Agrega las claves de Clerk.
3. Crea o conecta una base de datos Neon y agrega su cadena en `DATABASE_URL`.
4. Prepara las tablas y ejecuta la aplicación:

```bash
npm install
npm run db:migrate
npm run dev
```

## Variables necesarias

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
DATABASE_URL=postgresql://...
```

Las demás variables de Clerk incluidas en `.env.example` definen las rutas locales de acceso y registro.

## Despliegue en Vercel

1. Sube el repositorio a GitHub e impórtalo en Vercel como proyecto Next.js.
2. En **Storage / Marketplace**, instala Neon y conecta la base al proyecto. Verifica que exista `DATABASE_URL` en Production, Preview y Development.
3. Agrega las dos claves de Clerk en **Settings > Environment Variables**.
4. Despliega. `vercel.json` ejecuta automáticamente la migración antes de `next build`.
5. En Clerk, añade el dominio de Vercel a los dominios permitidos y conserva el modo **Restricted** si solo quieres administradores invitados.

## Comandos

- `npm run dev`: desarrollo local con Next.js.
- `npm run build`: compilación local sin modificar la base.
- `npm run vercel-build`: migración de PostgreSQL y compilación de producción.
- `npm run db:migrate`: crea las tablas e índices necesarios.
- `npm test`: valida la configuración preparada para Vercel.

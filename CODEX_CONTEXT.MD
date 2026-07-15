# SurveyOps AI - Contexto para Codex

## Proyecto

Este proyecto es una plataforma web de creación y administración de encuestas que ya se encuentra completamente funcional.

El objetivo NO es crear una plataforma nueva.

El objetivo es integrar un AGENTE DE IA que pueda operar sobre la plataforma existente utilizando la Responses API de OpenAI.

Todo el desarrollo debe respetar la arquitectura actual y reutilizar el código existente.

---

# Objetivo principal

Construir un agente autónomo capaz de:

- Crear encuestas
- Editar encuestas
- Agregar preguntas
- Publicar encuestas
- Analizar resultados
- Resumir respuestas
- Recomendar acciones

El agente debe ejecutar acciones reales dentro de la plataforma.

NO debe limitarse a responder texto.

---

# Stack

Frontend

- Next.js 16
- React 19
- TypeScript
- App Router
- CSS propio responsive

Backend

No existe Express.

Toda la lógica backend utiliza Route Handlers de Next.js.

API existentes:

/api/admin/surveys

/api/admin/surveys/[id]/results

/api/public/surveys/[slug]

/api/public/surveys/[slug]/responses

/api/qr

Base de datos

Neon PostgreSQL

Tablas

- surveys
- questions
- responses
- answers

Autenticación

Clerk

Hosting

Vercel

---

# Archivos importantes

La lógica principal de encuestas se encuentra en:

lib/surveys.ts

Conexión a la base de datos:

lib/db.ts

Esquema SQL:

drizzle/0000_pulso_postgres.sql

Componentes:

app/components

NO dupliques lógica.

Siempre reutiliza funciones existentes.

---

# Restricciones

NO crear otro backend.

NO crear Express.

NO crear FastAPI.

NO modificar la arquitectura.

NO romper funcionalidades existentes.

NO duplicar consultas SQL.

NO reescribir el CRUD.

Todas las nuevas funcionalidades deben integrarse sobre el sistema actual.

---

# Nuevo módulo

Crear un módulo llamado AI Agent.

Este módulo será responsable de toda la integración con OpenAI.

Debe existir un endpoint dedicado:

/api/agent

Toda la comunicación con OpenAI debe pasar por este endpoint.

---

# Rol del agente

El agente actúa como un administrador inteligente de la plataforma.

Debe ayudar al usuario a administrar encuestas.

No es un chatbot genérico.

Debe utilizar herramientas para ejecutar acciones.

---

# Capacidades

El agente debe poder:

✓ Crear una encuesta

✓ Editar una encuesta

✓ Eliminar preguntas

✓ Agregar preguntas

✓ Obtener información de una encuesta

✓ Publicar una encuesta

✓ Analizar respuestas

✓ Generar recomendaciones

---

# Flujo esperado

Usuario

↓

Describe una necesidad

↓

El agente hace preguntas aclaratorias

↓

Cuando tiene suficiente información

↓

Ejecuta herramientas

↓

Actualiza la base de datos

↓

Informa el resultado

---

# Filosofía

El agente debe ejecutar acciones.

Siempre que una petición requiera modificar el sistema debe utilizar una herramienta.

Nunca inventar datos.

Nunca simular acciones.

Nunca responder "ya está hecho" si no ejecutó la operación.

---

# Seguridad

Todas las operaciones deben respetar Clerk.

El usuario únicamente puede acceder a sus propias encuestas.

Nunca confiar en ownerId recibido desde el frontend.

El usuario autenticado debe obtenerse desde Clerk.

---

# Herramientas

Se espera implementar herramientas similares a:

createSurvey()

editSurvey()

publishSurvey()

addQuestion()

deleteQuestion()

getSurvey()

getResponses()

analyzeResponses()

Cada herramienta debe reutilizar lib/surveys.ts siempre que sea posible.

---

# Arquitectura esperada

Frontend

↓

Chat IA

↓

/api/agent

↓

Responses API

↓

Tool Calling

↓

lib/surveys.ts

↓

Neon PostgreSQL

---

# UX

El usuario debe sentir que habla con un empleado virtual.

No con ChatGPT.

Ejemplo:

Usuario:

"Necesito una encuesta para evaluar el servicio."

↓

El agente hace preguntas.

↓

Construye la encuesta.

↓

La guarda.

↓

Pregunta si desea publicarla.

↓

La publica.

---

# Estilo de código

- TypeScript estricto
- Componentes reutilizables
- Código limpio
- Sin duplicación
- Funciones pequeñas
- Comentarios solo cuando agreguen valor

---

# Desarrollo

Trabajar siempre en pequeños pasos.

Antes de implementar una funcionalidad:

1. Explicar el plan.

2. Esperar aprobación cuando el cambio sea grande.

3. Implementar.

4. Ejecutar pruebas.

5. Explicar cambios realizados.

---

# Prioridades

Sprint 1

Crear endpoint /api/agent

Sprint 2

Integrar Responses API

Sprint 3

Crear herramienta createSurvey()

Sprint 4

Crear interfaz del chat

Sprint 5

Agregar editSurvey()

Sprint 6

Agregar publishSurvey()

Sprint 7

Agregar analyzeResponses()

Sprint 8

Pulido final

---

# Definición de éxito

El proyecto estará terminado cuando sea posible demostrar el siguiente flujo:

Usuario:

"Quiero crear una encuesta para medir la satisfacción de los estudiantes."

↓

El agente conversa.

↓

Crea la encuesta.

↓

La guarda.

↓

La publica.

↓

El usuario responde la encuesta.

↓

El agente analiza las respuestas.

↓

Genera recomendaciones.

Todo el flujo debe ejecutarse sobre la plataforma existente sin romper ninguna funcionalidad.

# Reglas para Codex

Antes de modificar cualquier archivo:

1. Explica qué vas a hacer.
2. Indica qué archivos modificarás.
3. Explica por qué esos archivos.
4. Implementa cambios pequeños.
5. Verifica que compile.
6. No rompas funcionalidades existentes.
7. Si detectas una mejor arquitectura, propónla antes de implementarla.
8. Si necesitas crear un archivo nuevo, justifica por qué.
9. Evita duplicar lógica.
10. Reutiliza siempre el código existente.
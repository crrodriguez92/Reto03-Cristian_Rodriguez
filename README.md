# Reto técnico 03 — Agente conversacional para órdenes de compra SAP

## 1. Descripción del proyecto

Este proyecto tiene como objetivo desarrollar un agente conversacional para apoyar la gestión de solicitudes de órdenes de compra SAP mediante la validación de información, la aplicación de reglas de negocio, la identificación de excepciones y la preparación de órdenes de compra a través de un adaptador SAP simulado.

La solución contempla una interfaz web para consultar solicitudes y ejecutar validaciones, un backend para procesar la información y un agente de inteligencia artificial que permitirá interactuar con las herramientas de negocio mediante lenguaje natural.

El proyecto se encuentra en desarrollo incremental. Actualmente dispone de una interfaz web inicial, un backend en Express y una implementación parcial de las reglas de validación. La integración del modelo de lenguaje, el ciclo conversacional y la creación de órdenes mediante el adaptador SAP simulado están pendientes de completar y validar.

## 2. Objetivos

- Consultar y analizar solicitudes de órdenes de compra.
- Validar proveedores, aprobaciones, centros de costo, importes y demás condiciones de negocio.
- Identificar información incompleta y valores que puedan derivarse de los maestros disponibles.
- Diferenciar entre errores bloqueantes y excepciones que requieren confirmación humana.
- Preparar la información estructurada para la creación de órdenes de compra.
- Registrar los resultados de validación y las excepciones para facilitar la trazabilidad.
- Incorporar un agente conversacional que permita interactuar con las herramientas mediante lenguaje natural.

## 3. Tecnologías utilizadas

| Tecnología | Uso |
|---|---|
| Node.js 20 o superior | Entorno de ejecución del backend. |
| TypeScript | Desarrollo con tipado estático. |
| Express | Implementación de los endpoints HTTP. |
| Zod | Validación y definición de esquemas de datos. |
| HTML, CSS y JavaScript | Interfaz web inicial. |
| Git y GitHub | Control de versiones y alojamiento del código. |
| Render | Plataforma prevista para el despliegue público. |

La integración de un proveedor y modelo de lenguaje se definirá durante la implementación del agente conversacional.

## 4. Arquitectura y estructura del proyecto

La estructura principal del repositorio es la siguiente:

```text
Reto03-Cristian_Rodriguez/
├── fixtures/
│   ├── maestros/
│   └── solicitudes/
│       ├── sol-001/
│       ├── sol-002/
│       ├── sol-003/
│       ├── sol-004/
│       ├── sol-005/
│       └── sol-006/
├── public/
│   └── index.html
├── src/
│   ├── server.ts
│   ├── tools/
│   │   └── oc.ts
│   ├── llm/
│   └── sap/
├── demo.ts
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

Los directorios `src/llm/` y `src/sap/` están previstos para alojar la integración del modelo de lenguaje y el adaptador SAP simulado, respectivamente. Su implementación debe completarse como
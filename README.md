# SAP B1 ServiceLayer MCP Server

Servidor MCP (Model Context Protocol) para conectar asistentes de IA (opencode, Claude, etc.) al ServiceLayer de SAP Business One 10.0, en red local. Ejecutable con `npx` desde este repositorio de GitHub, sin instalar nada en el PC.

## Características

- **Solo lectura por defecto**: con `SAP_B1_READONLY=true` (default) solo se registran tools de consulta (`GET`). Los tools de escritura (`POST`/`PATCH`/`DELETE`) **no existen** en el servidor y no pueden llamarse.
- **Descubrimiento total**: `sap_list_entities`, `sap_get_entity_schema` y `sap_list_actions` consultan `GET /$metadata` (descargado una sola vez por proceso y cacheado) y exponen las ~140 entidades CRUD (incluidas tablas de usuario `@` y UDOs) y los cientos de métodos de servicio del ServiceLayer.
- **Modo escritura opcional**: con `SAP_B1_READONLY=false` se habilitan `sap_create`, `sap_update`, `sap_delete` para entidades del ServiceLayer y `sap_call_action` para métodos de servicio (pueden tener efectos colaterales).
- **Ejecución vía `npx github:`**: sin instalación manual.
- **Sesión gestionada**: login implícito con `CompanyDB`/usuario/contraseña, cookies `B1SESSION` + `ROUTEID` mantenidas en memoria (soporta ServiceLayer multi-nodo), re-login automático ante `401` y **logout garantizado** al cerrarse el proceso (además del tool `sap_logout`).
- **TLS autofirmado**: soporte para certificados autofirmados del ServiceLayer (típico en entornos locales) mediante `SAP_B1_VERIFY_TLS=false`.
- **Sin telemetría ni llamadas externas**: el cliente HTTP apunta exclusivamente a la URL configurada (`SAP_B1_SERVER_URL`).
- **Límites de seguridad**: `top` acotado a 200 registros por consulta.

## Tools

### Lectura (siempre disponibles)

| Tool | Descripción |
|---|---|
| `sap_query` | GET genérico a cualquier entidad OData con `select`, `filter`, `top` (≤200), `skip`, `orderby`, `expand` |
| `sap_list_entities` | Lista todas las entidades OData expuestas por el ServiceLayer (desde `$metadata`, cacheado); incluye tablas de usuario (`@`) y UDOs. `filter` opcional para acotar |
| `sap_get_entity_schema` | Esquema de una entidad: propiedades (tipos/claves) **y navigationProperties** (válidas para `$expand`); resuelve entity sets que comparten EntityType |
| `sap_list_actions` | Lista los métodos de servicio (function imports, ej: `CompanyService_GetCompanyInfo`) con sus parámetros |
| `sap_sql_query` | SQL de solo lectura (`SELECT`/`WITH`; INSERT/UPDATE/DELETE/DDL rechazados) vía `POST /sql_query` — solo en ServiceLayer v2/FP recientes; en v1 antiguos responde error claro |
| `sap_get_business_partners` | Socios de negocio (clientes/proveedores), filtro por `card_type` |
| `sap_get_items` | Artículos del catálogo |
| `sap_get_sales_orders` | Pedidos de venta; en v1 las líneas (`DocumentLines`) vienen incluidas sin expand (expand es solo v2) |
| `sap_get_stock` | Stock de un artículo por `ItemCode` (+ `WarehouseCode` opcional); error claro si `ItemStock` no existe en el ServiceLayer (v1 antiguos) |
| `sap_session_status` | Estado de la sesión activa |
| `sap_logout` | Cierre explícito de la sesión |

### Escritura (solo si `SAP_B1_READONLY=false`)

| Tool | Descripción |
|---|---|
| `sap_create` | Crea un registro en una entidad (`POST`) |
| `sap_update` | Actualiza un registro por su clave (`PATCH`) |
| `sap_delete` | Elimina un registro por su clave (`DELETE`) |
| `sap_call_action` | Invoca un método de servicio (`POST`); puede tener efectos colaterales (Cancel, UpdateCompanyInfo, Import...) |

## Requisitos

- Node.js 18+
- SAP Business One 10.0 con ServiceLayer habilitado (ruta típica `https://<host>:50000/b1s/v1`)
- opencode (o cualquier cliente MCP)

## Configuración (variables de entorno)

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `SAP_B1_SERVER_URL` | Sí | - | URL base del ServiceLayer (ej: `https://<host>:50000/b1s/v1`) |
| `SAP_B1_DATABASE` | Sí | - | Nombre de la CompanyDB (ej: `SBODEMO_XX`) |
| `SAP_B1_USERNAME` | Sí | - | Usuario del ServiceLayer |
| `SAP_B1_PASSWORD` | Sí | - | Contraseña del usuario |
| `SAP_B1_READONLY` | No | `true` | `false` habilita los tools de escritura |
| `SAP_B1_VERIFY_TLS` | No | `true` | `false` para certificados autofirmados |
| `SAP_B1_MAX_TOP` | No | `200` | Límite máximo de `top` por consulta |

## Uso con opencode

En `opencode.json` del proyecto:

```json
{
  "mcp": {
    "sap-b1-servicelayer": {
      "type": "local",
      "command": ["npx", "-y", "github:leonardows1/sap-b1-servicelayer-mcp"],
      "environment": {
        "SAP_B1_SERVER_URL": "https://<host>:50000/b1s/v1",
        "SAP_B1_DATABASE": "<CompanyDB>",
        "SAP_B1_USERNAME": "<usuario>",
        "SAP_B1_PASSWORD": "<password>",
        "SAP_B1_SESSION_TIMEOUT": "30",
        "SAP_B1_VERIFY_TLS": "false",
        "SAP_B1_READONLY": "true"
      },
      "enabled": true
    }
  }
}
```

Reiniciar opencode después de guardar la configuración.

## Seguridad

- Credenciales y cookies de sesión nunca se registran en logs.
- El proceso solo se comunica con `SAP_B1_SERVER_URL`.
- En modo `READONLY=true` los tools de escritura no se registran: es imposible crear/actualizar/eliminar registros, por diseño.
- Configuración validada al arrancar: faltan `SAP_B1_SERVER_URL`, `SAP_B1_DATABASE`, `SAP_B1_USERNAME` o `SAP_B1_PASSWORD` → el proceso aborta con mensaje claro.
- Nombres de entidad validados (`^[A-Za-z][A-Za-z0-9_]*$`): no se pueden inyectar rutas (ej: `BusinessPartners/...`).
- Valores de clave y filtros escapados en OData (comillas simples duplicadas): un `id` o `ItemCode` con `'` no rompe la URL ni el `$filter`.
- La contraseña queda en texto plano en la configuración del cliente MCP. Considerar un secret manager si se comparte el repositorio.
- `npx github:` no tiene versionado semver: cada ejecución toma la última versión del branch `main`. Tras actualizar el repo, usar `npm cache clean --force` para forzar la recarga.

## Estructura

Arquitectura hexagonal pragmática (ESM, sin framework): el dominio y los
casos de uso no conocen el transporte MCP ni el HTTP; la infraestructura
implementa el puerto `ServiceLayerPort` (DIP) y los tools MCP son
controladores delgados.

```
sap-b1-servicelayer-mcp/
├── package.json                  # Definición del paquete npm (bin: server.js)
├── server.js                     # Composition root: cablea dependencias y arranca stdio
├── src/
│   ├── config/
│   │   └── config.js             # Configuración desde env, validada e inmutable
│   ├── domain/
│   │   ├── errors.js             # Excepciones tipadas (Configuration/InvalidArgument/ServiceLayer)
│   │   ├── oData.js              # Helpers puros: query string, filtros, clamp de $top, validación de entidad
│   │   └── edmx.js               # Parseo puro de $metadata: entity sets, esquemas, function imports
│   ├── application/
│   │   ├── ports.js              # Puerto ServiceLayerPort (contrato, DIP)
│   │   ├── helpers.js            # ensureOk / ensureSuccess / unwrapValue
│   │   └── services/
│   │       ├── queryService.js   # Consulta GET genérica a entidades OData
│   │       ├── catalogService.js # Socios de negocio y artículos (compone QueryService)
│   │       ├── salesService.js   # Pedidos de venta y stock
│   │       ├── sessionService.js # Estado y cierre de sesión
│   │       ├── writeService.js   # create / update / delete
│   │       ├── metadataService.js # Descubrimiento: $metadata cacheado, entidades, esquemas y actions
│   │       └── sqlService.js     # SQL de solo lectura (SELECT/WITH) vía POST /sql_query
│   └── infrastructure/
│       ├── http/
│       │   ├── httpClient.js     # Cliente HTTP mínimo (http/https)
│       │   ├── cookies.js        # Manipulación pura de cookies de sesión
│       │   └── serviceLayerClient.js # Adaptador del puerto: login, 401, logout
│       └── mcp/
│           ├── result.js         # ok / err / serialize / handle (controladores delgados)
│           └── tools.js          # Registro de tools MCP
├── test/                         # node:test (sin dependencias externas)
│   ├── config.test.js
│   ├── oData.test.js
│   ├── edmx.test.js              # parseo EDMX v3/v4 (entity sets, esquemas, function imports)
│   ├── cookies.test.js
│   ├── client.test.js
│   ├── fakePort.js               # fake tipado del puerto ServiceLayerPort (compartido)
│   ├── services.test.js          # casos de uso con cliente fake (anti-inyección)
│   ├── metadataService.test.js   # descubrimiento y acciones con fake
│   ├── sqlService.test.js        # SQL solo-lectura (rechazos, Service Not Found)
│   └── tools.test.js             # integración MCP in-memory (registro y llamadas)
├── .gitignore
└── README.md
```

## Adaptación al esquema real (verificado contra ServiceLayer 10.0 v1)

El servidor se adapta dinámicamente al `$metadata` de cada instancia, sin
nada hardcodeado. Hechos verificados en una instancia real (v1, OData v3):

- **Entity sets comparten EntityType**: `Orders`/`Invoices`/`DeliveryNotes` → `SAPB1.Document`.
  `sap_get_entity_schema` resuelve el tipo real automáticamente.
- **Líneas de documento**: en v1 son *complex collections* (`DocumentLines`,
  `DocumentInstallments`) que vienen **inline** en la respuesta; `$expand`
  solo aplica a navigationProperties (el esquema las lista, ej:
  `BusinessPartner`, `Currency`).
- **Campos financieros**: en v1 `BusinessPartners` no tiene `Balance`;
  usa `CurrentAccountBalance`, `OpenOrdersBalance`, `OpenDeliveryNotesBalance`.
  Las facturas no tienen `BalanceDue`: el saldo abierto es `DocTotal − PaidToDate`.
- **Sin `ItemStock` ni `/sql_query`** en v1 antiguos: `sap_get_stock` avisa con
  entidades de stock reales descubiertas; `sap_sql_query` devuelve error claro.
- **Function imports v3** con `IsBindable="true"` se listan como `bound`
  (no invocables standalone) para no contaminar `sap_list_actions`.

### Receta: reporte de antigüedad de saldos (30/60/90)

Sin SQL, solo con `sap_query` (funciona en cualquier v1/v2):

1. Facturas abiertas (paginar con `skip` en lotes ≤200 si hay muchas):
   ```
   sap_query('Invoices',
     filter='PaidToDate lt DocTotal',
     select='CardCode,CardName,DocNum,DocDate,DocDueDate,DocTotal,PaidToDate,DocumentStatus,ControlAccount')
   ```
2. Por cada factura: `saldo = DocTotal − PaidToDate`; `días = hoy − DocDueDate`.
3. Agrupar por rangos **0-30 / 31-60 / 61-90 / 90+** y por cliente (o por
   `ControlAccount` para la vista por cuenta contable).
4. Totales por cliente/cuenta: `sap_get_business_partners` con
   `CurrentAccountBalance` (saldo actual) y `CreditLimit`.

Con `sap_sql_query` (v2) el mismo reporte es una sola query sobre
`OINV`/`OINV3`/`OFRJ`/`OCRD`.

## Desarrollo

```bash
npm install     # dependencias
npm test        # tests (node:test)
npm run typecheck  # verificación de tipos estricta (tsc --noEmit sobre JSDoc)
npm start       # arranque local (requiere variables de entorno)
```

Todo el código JS está verificado con TypeScript estricto vía JSDoc
(`checkJs` + `strict` + `noUncheckedIndexedAccess`): `tsconfig.json` sin
build step, el servidor se ejecuta directo con `node`.

## Verificación manual (JSON-RPC por stdio)

```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | \
  SAP_B1_SERVER_URL=... SAP_B1_DATABASE=... SAP_B1_USERNAME=... SAP_B1_PASSWORD=... \
  npx -y github:leonardows1/sap-b1-servicelayer-mcp
```
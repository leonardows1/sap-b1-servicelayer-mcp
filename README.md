# SAP B1 ServiceLayer MCP Server

Servidor MCP (Model Context Protocol) para conectar asistentes de IA (opencode, Claude, etc.) al ServiceLayer de SAP Business One 10.0, en red local. Ejecutable con `npx` desde este repositorio de GitHub, sin instalar nada en el PC.

## Características

- **Solo lectura por defecto**: con `SAP_B1_READONLY=true` (default) solo se registran tools de consulta (`GET`). Los tools de escritura (`POST`/`PATCH`/`DELETE`) **no existen** en el servidor y no pueden llamarse.
- **Modo escritura opcional**: con `SAP_B1_READONLY=false` se habilitan `sap_create`, `sap_update` y `sap_delete` para entidades del ServiceLayer.
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
| `sap_get_business_partners` | Socios de negocio (clientes/proveedores), filtro por `card_type` |
| `sap_get_items` | Artículos del catálogo |
| `sap_get_sales_orders` | Pedidos de venta (con `expand` de líneas) |
| `sap_get_stock` | Stock de un artículo por `ItemCode` (+ `WarehouseCode` opcional) |
| `sap_session_status` | Estado de la sesión activa |
| `sap_logout` | Cierre explícito de la sesión |

### Escritura (solo si `SAP_B1_READONLY=false`)

| Tool | Descripción |
|---|---|
| `sap_create` | Crea un registro en una entidad (`POST`) |
| `sap_update` | Actualiza un registro por su clave (`PATCH`) |
| `sap_delete` | Elimina un registro por su clave (`DELETE`) |

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
- La contraseña queda en texto plano en la configuración del cliente MCP. Considerar un secret manager si se comparte el repositorio.
- `npx github:` no tiene versionado semver: cada ejecución toma la última versión del branch `main`. Tras actualizar el repo, usar `npm cache clean --force` para forzar la recarga.

## Estructura

```
sap-b1-servicelayer-mcp/
├── package.json    # Definición del paquete npm (bin: server.js)
├── server.js       # Servidor MCP completo
├── .gitignore
└── README.md
```

## Verificación manual (JSON-RPC por stdio)

```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | \
  SAP_B1_SERVER_URL=... SAP_B1_DATABASE=... SAP_B1_USERNAME=... SAP_B1_PASSWORD=... \
  npx -y github:leonardows1/sap-b1-servicelayer-mcp
```
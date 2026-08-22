#!/usr/bin/env node
/**
 * Composition root: cablea configuración, infraestructura y casos de uso,
 * registra los tools MCP y arranca el transporte stdio.
 * No contiene lógica de negocio.
 */
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./src/config/config.js";
import { ConfigurationError } from "./src/domain/errors.js";
import { createHttpClient } from "./src/infrastructure/http/httpClient.js";
import { ServiceLayerClient } from "./src/infrastructure/http/serviceLayerClient.js";
import { createQueryService } from "./src/application/services/queryService.js";
import { createCatalogService } from "./src/application/services/catalogService.js";
import { createSalesService } from "./src/application/services/salesService.js";
import { createSessionService } from "./src/application/services/sessionService.js";
import { createWriteService } from "./src/application/services/writeService.js";
import { createMetadataService } from "./src/application/services/metadataService.js";
import { createSqlService } from "./src/application/services/sqlService.js";
import { registerTools } from "./src/infrastructure/mcp/tools.js";

const SERVER_NAME = "sap-b1-servicelayer";

function buildServer() {
  const config = loadConfig();
  const httpClient = createHttpClient(config);
  const client = new ServiceLayerClient(httpClient, config);

  const queryService = createQueryService(client, config.maxTop);
  const catalogService = createCatalogService(queryService);
  const metadataService = createMetadataService(client);
  const salesService = createSalesService(queryService, metadataService);
  const sessionService = createSessionService(client);
  const writeService = createWriteService(client);
  const sqlService = createSqlService(client);

  const { version } = createRequire(import.meta.url)("./package.json");
  const server = new McpServer({ name: SERVER_NAME, version });

  registerTools(server, {
    queryService,
    catalogService,
    salesService,
    sessionService,
    writeService,
    metadataService,
    sqlService,
    maxTop: config.maxTop,
    readonly: config.readonly,
  });

  return { server, client };
}

async function main() {
  const { server, client } = buildServer();
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
  } finally {
    await client.logout().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e instanceof ConfigurationError ? e.message : e);
  process.exit(1);
});
import { test } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerTools } from "../src/infrastructure/mcp/tools.js";
import { createQueryService } from "../src/application/services/queryService.js";
import { createCatalogService } from "../src/application/services/catalogService.js";
import { createSalesService } from "../src/application/services/salesService.js";
import { createSessionService } from "../src/application/services/sessionService.js";
import { createWriteService } from "../src/application/services/writeService.js";

const READ_TOOLS = [
  "sap_query",
  "sap_get_business_partners",
  "sap_get_items",
  "sap_get_sales_orders",
  "sap_get_stock",
  "sap_session_status",
  "sap_logout",
];
const WRITE_TOOLS = ["sap_create", "sap_update", "sap_delete"];

/** Cliente fake del puerto: responde según la ruta. */
function makeFakeClient() {
  return {
    hasSession: () => true,
    sessionAgeSeconds: () => 42,
    request: async () => ({ status: 200, body: null }),
    authorizedRequest: async (method, path) => {
      if (path === "/BusinessPartners?%24select=CardCode") {
        return { status: 200, body: { value: [{ CardCode: "C1", CardName: "Cliente 1" }] } };
      }
      if (path === "/Login") return { status: 200, body: {} };
      if (path === "/Logout") return { status: 200, body: {} };
      return { status: 200, body: {} };
    },
    logout: async () => 200,
  };
}

function buildServer(readonly) {
  const client = makeFakeClient();
  const queryService = createQueryService(client, 200);
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, {
    queryService,
    catalogService: createCatalogService(queryService),
    salesService: createSalesService(queryService),
    sessionService: createSessionService(client),
    writeService: createWriteService(client),
    maxTop: 200,
    readonly,
  });
  return { server, client };
}

async function withClient(server, fn) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test("readonly: registra solo tools de lectura", async () => {
  const { server } = buildServer(true);
  await withClient(server, async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, READ_TOOLS.sort());
  });
});

test("escritura: registra tools de lectura y escritura", async () => {
  const { server } = buildServer(false);
  await withClient(server, async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [...READ_TOOLS, ...WRITE_TOOLS].sort());
  });
});

test("sap_query: responde ok con datos serializados", async () => {
  const { server } = buildServer(true);
  await withClient(server, async (client) => {
    const res = await client.callTool({
      name: "sap_query",
      arguments: { entity: "BusinessPartners", select: "CardCode" },
    });
    assert.equal(res.isError, undefined);
    const text = res.content.find((c) => c.type === "text").text;
    assert.deepEqual(JSON.parse(text), [{ CardCode: "C1", CardName: "Cliente 1" }]);
  });
});

test("sap_query: entidad maliciosa responde isError sin llamar al cliente", async () => {
  const { server, client: fake } = buildServer(true);
  await withClient(server, async (client) => {
    const res = await client.callTool({
      name: "sap_query",
      arguments: { entity: "BusinessPartners/delete" },
    });
    assert.equal(res.isError, true);
    const text = res.content.find((c) => c.type === "text").text;
    assert.match(JSON.parse(text).error, /entity inválida/);
  });
  assert.equal(fake.calls?.length ?? 0, 0);
});

test("sap_logout: tool de sesión funciona en modo readonly", async () => {
  const { server } = buildServer(true);
  await withClient(server, async (client) => {
    const res = await client.callTool({ name: "sap_logout", arguments: {} });
    assert.equal(res.isError, undefined);
    const text = res.content.find((c) => c.type === "text").text;
    assert.deepEqual(JSON.parse(text), { logged_out: true, http: 200 });
  });
});
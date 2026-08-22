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
import { createMetadataService } from "../src/application/services/metadataService.js";

const READ_TOOLS = [
  "sap_query",
  "sap_get_business_partners",
  "sap_get_items",
  "sap_get_sales_orders",
  "sap_get_stock",
  "sap_list_entities",
  "sap_get_entity_schema",
  "sap_list_actions",
  "sap_session_status",
  "sap_logout",
];
const WRITE_TOOLS = ["sap_create", "sap_update", "sap_delete", "sap_call_action"];

const METADATA_XML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices>
    <Schema Namespace="SAPB1" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
      <EntityType Name="BusinessPartners" OpenType="true">
        <Key><PropertyRef Name="CardCode"/></Key>
        <Property Name="CardCode" Type="Edm.String" Nullable="false"/>
        <Property Name="CardName" Type="Edm.String"/>
      </EntityType>
      <EntityContainer Name="SAPB1">
        <EntitySet Name="BusinessPartners" EntityType="SAPB1.BusinessPartners"/>
        <FunctionImport Name="CompanyService_GetCompanyInfo" ReturnType="SAPB1.CompanyInfo">
          <Parameter Name="CompanyInfo" Mode="In" Type="SAPB1.CompanyInfo"/>
        </FunctionImport>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

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
      if (path === "/$metadata") {
        return { status: 200, body: null, text: METADATA_XML };
      }
      if (path === "/CompanyService_GetCompanyInfo") {
        return { status: 200, body: { CompanyInfo: { Name: "ACME" } } };
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
    metadataService: createMetadataService(client),
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

test("sap_list_entities: devuelve entidades desde $metadata", async () => {
  const { server } = buildServer(true);
  await withClient(server, async (client) => {
    const res = await client.callTool({ name: "sap_list_entities", arguments: {} });
    assert.equal(res.isError, undefined);
    const text = res.content.find((c) => c.type === "text").text;
    assert.deepEqual(JSON.parse(text), {
      total: 1,
      entities: [{ name: "BusinessPartners", userTable: false }],
    });
  });
});

test("sap_get_entity_schema: devuelve propiedades de la entidad", async () => {
  const { server } = buildServer(true);
  await withClient(server, async (client) => {
    const res = await client.callTool({
      name: "sap_get_entity_schema",
      arguments: { entity: "BusinessPartners" },
    });
    assert.equal(res.isError, undefined);
    const text = res.content.find((c) => c.type === "text").text;
    const schema = JSON.parse(text);
    assert.equal(schema.openType, true);
    assert.deepEqual(schema.properties.map((p) => p.name), ["CardCode", "CardName"]);
  });
});

test("sap_list_actions: lista function imports en ambos modos", async () => {
  const { server } = buildServer(true);
  await withClient(server, async (client) => {
    const res = await client.callTool({ name: "sap_list_actions", arguments: {} });
    assert.equal(res.isError, undefined);
    const text = res.content.find((c) => c.type === "text").text;
    assert.deepEqual(JSON.parse(text), {
      total: 1,
      actions: [
        {
          name: "CompanyService_GetCompanyInfo",
          kind: "function",
          returnType: "SAPB1.CompanyInfo",
          parameters: [{ name: "CompanyInfo", type: "SAPB1.CompanyInfo", mode: "In" }],
        },
      ],
    });
  });
});

test("sap_call_action: disponible en modo escritura e invoca POST", async () => {
  const { server } = buildServer(false);
  await withClient(server, async (client) => {
    const res = await client.callTool({
      name: "sap_call_action",
      arguments: { action: "CompanyService_GetCompanyInfo", params: {} },
    });
    assert.equal(res.isError, undefined);
    const text = res.content.find((c) => c.type === "text").text;
    assert.deepEqual(JSON.parse(text), { CompanyInfo: { Name: "ACME" } });
  });
});

test("sap_call_action: rechaza nombre inválido sin llamar al cliente", async () => {
  const { server, client: fake } = buildServer(false);
  await withClient(server, async (client) => {
    const res = await client.callTool({
      name: "sap_call_action",
      arguments: { action: "Orders(1)/Cancel" },
    });
    assert.equal(res.isError, true);
    const text = res.content.find((c) => c.type === "text").text;
    assert.match(JSON.parse(text).error, /action inválida/);
  });
  assert.equal(fake.calls?.length ?? 0, 0);
});
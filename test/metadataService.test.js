import { test } from "node:test";
import assert from "node:assert/strict";
import { createMetadataService } from "../src/application/services/metadataService.js";
import { InvalidArgumentError, ServiceLayerError } from "../src/domain/errors.js";

const XML = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices>
    <Schema Namespace="SAPB1" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
      <EntityType Name="BusinessPartners" OpenType="true">
        <Key><PropertyRef Name="CardCode"/></Key>
        <Property Name="CardCode" Type="Edm.String" Nullable="false"/>
        <Property Name="CardName" Type="Edm.String"/>
      </EntityType>
      <EntityType Name="@MYPORTAL">
        <Key><PropertyRef Name="Code"/></Key>
        <Property Name="Code" Type="Edm.String" Nullable="false"/>
      </EntityType>
      <EntityContainer Name="SAPB1">
        <EntitySet Name="BusinessPartners" EntityType="SAPB1.BusinessPartners"/>
        <EntitySet Name="@MYPORTAL" EntityType="SAPB1.@MYPORTAL"/>
        <FunctionImport Name="CompanyService_GetCompanyInfo" ReturnType="SAPB1.CompanyInfo">
          <Parameter Name="CompanyInfo" Mode="In" Type="SAPB1.CompanyInfo"/>
        </FunctionImport>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

/** Fake del puerto: registra llamadas y responde según ruta. */
function makeFakeClient() {
  const calls = [];
  return {
    calls,
    authorizedRequest: async (method, path, body = null) => {
      calls.push({ method, path, body });
      if (path === "/$metadata") {
        return { status: 200, body: null, text: XML };
      }
      if (path === "/CompanyService_GetCompanyInfo") {
        return { status: 200, body: { CompanyInfo: { Name: "ACME" } } };
      }
      if (path === "/OrdersService_Cancel") {
        return { status: 204, body: null };
      }
      if (path === "/BrokenAction") {
        return { status: 500, body: { error: { message: { value: "boom" } } } };
      }
      return { status: 404, body: null };
    },
  };
}

test("listEntities: devuelve entidades ordenadas con flag de tablas de usuario", async () => {
  const client = makeFakeClient();
  const svc = createMetadataService(client);
  const res = await svc.listEntities();
  assert.equal(res.total, 2);
  assert.deepEqual(res.entities, [
    { name: "@MYPORTAL", userTable: true },
    { name: "BusinessPartners", userTable: false },
  ]);
});

test("listEntities: filter acota por substring", async () => {
  const svc = createMetadataService(makeFakeClient());
  const res = await svc.listEntities("portal");
  assert.equal(res.entities.length, 1);
  assert.equal(res.entities[0].name, "@MYPORTAL");
});

test("metadata: se descarga una sola vez (cache)", async () => {
  const client = makeFakeClient();
  const svc = createMetadataService(client);
  await svc.listEntities();
  await svc.getEntitySchema("BusinessPartners");
  await svc.listActions();
  const metadataCalls = client.calls.filter((c) => c.path === "/$metadata");
  assert.equal(metadataCalls.length, 1);
});

test("getEntitySchema: devuelve propiedades y rechaza entidad inexistente", async () => {
  const svc = createMetadataService(makeFakeClient());
  const schema = await svc.getEntitySchema("BusinessPartners");
  assert.equal(schema.openType, true);
  assert.equal(schema.properties[0].key, true);
  await assert.rejects(async () => svc.getEntitySchema("NoExiste"), InvalidArgumentError);
  await assert.rejects(async () => svc.getEntitySchema("BP/evil"), InvalidArgumentError);
});

test("listActions: lista function imports no-bound", async () => {
  const svc = createMetadataService(makeFakeClient());
  const res = await svc.listActions();
  assert.equal(res.total, 1);
  assert.equal(res.actions[0].name, "CompanyService_GetCompanyInfo");
  assert.equal(res.actions[0].parameters[0].name, "CompanyInfo");
});

test("callAction: POST con parámetros y body de respuesta", async () => {
  const client = makeFakeClient();
  const svc = createMetadataService(client);
  const res = await svc.callAction("CompanyService_GetCompanyInfo", {
    CompanyInfo: { Name: "ACME" },
  });
  assert.deepEqual(res, { CompanyInfo: { Name: "ACME" } });
  assert.deepEqual(client.calls[0], {
    method: "POST",
    path: "/CompanyService_GetCompanyInfo",
    body: { CompanyInfo: { Name: "ACME" } },
  });
});

test("callAction: 204 sin cuerpo responde {success:true}", async () => {
  const svc = createMetadataService(makeFakeClient());
  assert.deepEqual(await svc.callAction("OrdersService_Cancel", { DocEntry: 1 }), {
    success: true,
  });
});

test("callAction: error HTTP lanza ServiceLayerError y valida nombre", async () => {
  const svc = createMetadataService(makeFakeClient());
  await assert.rejects(async () => svc.callAction("BrokenAction", {}), ServiceLayerError);
  await assert.rejects(async () => svc.callAction("BP/evil", {}), InvalidArgumentError);
});

test("callAction: errores de $metadata se propagan", async () => {
  const client = makeFakeClient();
  const svc = createMetadataService(client);
  client.authorizedRequest = async () => ({
    status: 401,
    body: { error: { message: { value: "Unauthorized" } } },
    text: "",
  });
  await assert.rejects(async () => svc.listEntities(), ServiceLayerError);
});
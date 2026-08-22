import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseEntitySets,
  extractEntitySchema,
  parseFunctionImports,
} from "../src/domain/edmx.js";

const EDMX_V3 = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices m:DataServiceVersion="3.0" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
    <Schema Namespace="SAPB1" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
      <EntityType Name="BusinessPartners" OpenType="true">
        <Key><PropertyRef Name="CardCode"/></Key>
        <Property Name="CardCode" Type="Edm.String" Nullable="false"/>
        <Property Name="CardName" Type="Edm.String"/>
        <Property Name="Balance" Type="Edm.Decimal"/>
      </EntityType>
      <EntityType Name="@MYPORTAL">
        <Key><PropertyRef Name="Code"/></Key>
        <Property Name="Code" Type="Edm.String" Nullable="false"/>
        <Property Name="U_Field1" Type="Edm.String"/>
      </EntityType>
      <EntityContainer Name="SAPB1">
        <EntitySet Name="BusinessPartners" EntityType="SAPB1.BusinessPartners"/>
        <EntitySet Name="@MYPORTAL" EntityType="SAPB1.@MYPORTAL"/>
        <FunctionImport Name="CompanyService_GetCompanyInfo" ReturnType="SAPB1.CompanyInfo">
          <Parameter Name="CompanyInfo" Mode="In" Type="SAPB1.CompanyInfo"/>
        </FunctionImport>
        <FunctionImport Name="AccountCategoryService_GetCategoryList" ReturnType="SAPB1.AccountCategory">
        </FunctionImport>
        <FunctionImport Name="OrdersService_Cancel" ReturnType="None">
          <Parameter Name="DocEntry" Mode="In" Type="Edm.Int32"/>
        </FunctionImport>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

const EDMX_V4 = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="SAPB1" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Orders" OpenType="true">
        <Key><PropertyRef Name="DocEntry"/></Key>
        <Property Name="DocEntry" Type="Edm.Int32" Nullable="false"/>
      </EntityType>
      <Function Name="GetCompanyInfo" IsBound="false">
        <Parameter Name="CompanyInfo" Type="SAPB1.CompanyInfo"/>
      </Function>
      <Action Name="Cancel" IsBound="false">
        <Parameter Name="DocEntry" Type="Edm.Int32"/>
      </Action>
      <Action Name="Close" IsBound="true">
        <Parameter Name="Document" Type="SAPB1.Orders"/>
      </Action>
      <EntityContainer Name="SAPB1">
        <EntitySet Name="Orders" EntityType="SAPB1.Orders"/>
        <FunctionImport Name="CompanyService_GetCompanyInfo" Function="SAPB1.GetCompanyInfo"/>
        <ActionImport Name="OrdersService_Cancel" Action="SAPB1.Cancel"/>
        <ActionImport Name="OrdersService_Close" Action="SAPB1.Close"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

test("parseEntitySets: extrae entity sets e ignora function imports", () => {
  const sets = parseEntitySets(EDMX_V3);
  assert.deepEqual(sets, [
    { name: "BusinessPartners", entityType: "SAPB1.BusinessPartners" },
    { name: "@MYPORTAL", entityType: "SAPB1.@MYPORTAL" },
  ]);
});

test("parseEntitySets: v4 con namespaces distintos", () => {
  const sets = parseEntitySets(EDMX_V4);
  assert.deepEqual(sets, [{ name: "Orders", entityType: "SAPB1.Orders" }]);
});

test("extractEntitySchema: propiedades, claves y OpenType", () => {
  const schema = extractEntitySchema(EDMX_V3, "BusinessPartners");
  assert.equal(schema.name, "BusinessPartners");
  assert.equal(schema.openType, true);
  assert.deepEqual(schema.properties, [
    { name: "CardCode", type: "Edm.String", nullable: false, key: true },
    { name: "CardName", type: "Edm.String", nullable: true, key: false },
    { name: "Balance", type: "Edm.Decimal", nullable: true, key: false },
  ]);
});

test("extractEntitySchema: tablas de usuario y no encontrada", () => {
  const schema = extractEntitySchema(EDMX_V3, "@MYPORTAL");
  assert.equal(schema.openType, false);
  assert.equal(schema.properties[0].key, true);
  assert.equal(extractEntitySchema(EDMX_V3, "NoExiste"), null);
});

test("parseFunctionImports: v3 con parámetros inline", () => {
  const imports = parseFunctionImports(EDMX_V3);
  assert.deepEqual(imports, [
    {
      name: "CompanyService_GetCompanyInfo",
      kind: "function",
      returnType: "SAPB1.CompanyInfo",
      parameters: [{ name: "CompanyInfo", type: "SAPB1.CompanyInfo", mode: "In" }],
    },
    {
      name: "AccountCategoryService_GetCategoryList",
      kind: "function",
      returnType: "SAPB1.AccountCategory",
      parameters: [],
    },
    {
      name: "OrdersService_Cancel",
      kind: "function",
      returnType: "None",
      parameters: [{ name: "DocEntry", type: "Edm.Int32", mode: "In" }],
    },
  ]);
});

test("parseFunctionImports: v4 resuelve Function/Action y marca bound", () => {
  const imports = parseFunctionImports(EDMX_V4);
  assert.deepEqual(imports, [
    {
      name: "CompanyService_GetCompanyInfo",
      kind: "function",
      returnType: null,
      parameters: [{ name: "CompanyInfo", type: "SAPB1.CompanyInfo", mode: "In" }],
    },
    {
      name: "OrdersService_Cancel",
      kind: "action",
      returnType: null,
      parameters: [{ name: "DocEntry", type: "Edm.Int32", mode: "In" }],
    },
    { name: "OrdersService_Close", kind: "bound", returnType: null, parameters: [] },
  ]);
});
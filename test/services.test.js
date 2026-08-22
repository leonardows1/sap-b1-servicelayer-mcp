import { test } from "node:test";
import assert from "node:assert/strict";
import { createQueryService } from "../src/application/services/queryService.js";
import { createSalesService } from "../src/application/services/salesService.js";
import { createWriteService } from "../src/application/services/writeService.js";
import { InvalidArgumentError, ServiceLayerError } from "../src/domain/errors.js";
import { createFakePort } from "./fakePort.js";

test("queryService: valida el nombre de entidad (anti-inyección)", async () => {
  const client = createFakePort();
  const service = createQueryService(client, 200);
  await assert.rejects(
    async () => service.query("BusinessPartners/items;drop", {}),
    InvalidArgumentError
  );
  await assert.rejects(async () => service.query("", {}), InvalidArgumentError);
  assert.equal(client.calls.length, 0);
});

test("queryService: delega en el cliente con query string acotado", async () => {
  const client = createFakePort({
    responses: {
      "GET /BusinessPartners?%24select=CardCode&%24top=200": {
        status: 200,
        body: { value: [{ CardCode: "C1" }] },
        text: "",
        setCookies: [],
      },
    },
  });
  const service = createQueryService(client, 200);
  const result = await service.query("BusinessPartners", { select: "CardCode", top: 999 });
  assert.deepEqual(result, [{ CardCode: "C1" }]);
  assert.deepEqual(client.calls[0], {
    method: "GET",
    path: "/BusinessPartners?%24select=CardCode&%24top=200",
    body: null,
  });
});

test("queryService: respuesta no-200 lanza ServiceLayerError", async () => {
  const client = createFakePort({
    responses: {
      "GET /Items": {
        status: 400,
        body: { error: { message: { value: "Bad filter" } } },
        text: "",
        setCookies: [],
      },
    },
  });
  const service = createQueryService(client, 200);
  await assert.rejects(async () => service.query("Items", {}), ServiceLayerError);
});

test("writeService: create valida la entidad", async () => {
  const client = createFakePort();
  const service = createWriteService(client);
  await assert.rejects(async () => service.create("Orders/delete", {}), InvalidArgumentError);
  assert.equal(client.calls.length, 0);
});

test("writeService: update escapa comillas del id y valida la entidad", async () => {
  const client = createFakePort();
  const service = createWriteService(client);
  await service.update("BusinessPartners", "O'Reilly", { CardName: "X" });
  assert.deepEqual(client.calls[0], {
    method: "PATCH",
    path: "/BusinessPartners('O''Reilly')",
    body: { CardName: "X" },
  });
  await assert.rejects(async () => service.update("BP/evil", "C1", {}), InvalidArgumentError);
  await assert.rejects(
    async () => service.update("BusinessPartners", "", {}),
    InvalidArgumentError
  );
});

test("writeService: remove responde {deleted:true} solo ante 2xx", async () => {
  const client = createFakePort({
    responses: {
      "DELETE /Orders('99')": { status: 204, body: null, text: "", setCookies: [] },
    },
  });
  const service = createWriteService(client);
  assert.deepEqual(await service.remove("Orders", "99"), { deleted: true });

  const failing = createFakePort({
    responses: {
      "DELETE /Orders('404')": {
        status: 404,
        body: { error: { message: { value: "Not found" } } },
        text: "",
        setCookies: [],
      },
    },
  });
  const svc = createWriteService(failing);
  await assert.rejects(async () => svc.remove("Orders", "404"), ServiceLayerError);
});

test("getStock: error claro si ItemStock no existe en $metadata", async () => {
  const client = createFakePort();
  const queryService = createQueryService(client, 200);
  const metadataService = {
    entityExists: async () => false,
    listEntities: async () => ({ entities: [{ name: "Warehouses" }, { name: "StockTransfers" }] }),
  };
  const salesService = createSalesService(queryService, metadataService);
  await assert.rejects(
    async () => salesService.getStock({ itemCode: "X" }),
    (e) => e instanceof InvalidArgumentError && /ItemStock no existe/.test(e.message)
  );
  assert.equal(client.calls.length, 0);
});

test("getStock: el error sugiere entidades de stock descubiertas", async () => {
  const client = createFakePort();
  const queryService = createQueryService(client, 200);
  const metadataService = {
    entityExists: async () => false,
    listEntities: async () => ({ entities: [{ name: "Warehouses" }, { name: "Items" }] }),
  };
  const salesService = createSalesService(queryService, metadataService);
  await assert.rejects(
    async () => salesService.getStock({ itemCode: "X" }),
    (e) => e instanceof InvalidArgumentError && /Warehouses/.test(e.message)
  );
});

test("getStock: consulta ItemStock si existe", async () => {
  const client = createFakePort();
  const queryService = createQueryService(client, 200);
  const metadataService = {
    entityExists: async () => true,
    listEntities: async () => ({ entities: [] }),
  };
  const salesService = createSalesService(queryService, metadataService);
  await salesService.getStock({ itemCode: "A-1", warehouse: "01" });
  assert.equal(
    client.calls[0]?.path,
    "/ItemStock?%24select=ItemCode%2CWarehouseCode%2CQuantity%2CCommittedQuantity%2COnHand&%24filter=ItemCode+eq+%27A-1%27+and+WarehouseCode+eq+%2701%27&%24top=10"
  );
});
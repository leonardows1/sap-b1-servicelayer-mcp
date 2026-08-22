import { test } from "node:test";
import assert from "node:assert/strict";
import { createQueryService } from "../src/application/services/queryService.js";
import { createWriteService } from "../src/application/services/writeService.js";
import { InvalidArgumentError, ServiceLayerError } from "../src/domain/errors.js";

/** Cliente fake del puerto ServiceLayerPort: registra las llamadas. */
function makeFakeClient(respond = {}) {
  const calls = [];
  return {
    calls,
    authorizedRequest: async (method, path, body = null) => {
      calls.push({ method, path, body });
      const mock = respond[`${method} ${path}`];
      if (mock) return mock;
      return { status: 200, body: null };
    },
  };
}

test("queryService: valida el nombre de entidad (anti-inyección)", async () => {
  const client = makeFakeClient();
  const service = createQueryService(client, 200);
  await assert.rejects(
    () => service.query("BusinessPartners/items;drop", {}),
    InvalidArgumentError
  );
  await assert.rejects(() => service.query("", {}), InvalidArgumentError);
  assert.equal(client.calls.length, 0);
});

test("queryService: delega en el cliente con query string acotado", async () => {
  const client = makeFakeClient({
    "GET /BusinessPartners?%24select=CardCode&%24top=200": {
      status: 200,
      body: { value: [{ CardCode: "C1" }] },
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
  const client = makeFakeClient({
    "GET /Items": {
      status: 400,
      body: { error: { message: { value: "Bad filter" } } },
    },
  });
  const service = createQueryService(client, 200);
  await assert.rejects(() => service.query("Items", {}), ServiceLayerError);
});

test("writeService: create valida la entidad", async () => {
  const client = makeFakeClient();
  const service = createWriteService(client);
  await assert.rejects(async () => service.create("Orders/delete", {}), InvalidArgumentError);
  assert.equal(client.calls.length, 0);
});

test("writeService: update escapa comillas del id y valida la entidad", async () => {
  const client = makeFakeClient();
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
  const client = makeFakeClient({
    "DELETE /Orders('99')": { status: 204, body: null },
  });
  const service = createWriteService(client);
  assert.deepEqual(await service.remove("Orders", "99"), { deleted: true });

  const failing = makeFakeClient({
    "DELETE /Orders('404')": {
      status: 404,
      body: { error: { message: { value: "Not found" } } },
    },
  });
  const svc = createWriteService(failing);
  await assert.rejects(() => svc.remove("Orders", "404"), ServiceLayerError);
});
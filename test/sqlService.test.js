import { test } from "node:test";
import assert from "node:assert/strict";
import { createSqlService } from "../src/application/services/sqlService.js";
import { InvalidArgumentError, ServiceLayerError } from "../src/domain/errors.js";
import { createFakePort } from "./fakePort.js";

test("runSql: SELECT válido devuelve las filas", async () => {
  const client = createFakePort({
    responses: {
      "POST /sql_query": {
        status: 200,
        body: { value: [{ CardCode: "C1" }, { CardCode: "C2" }] },
        text: "",
        setCookies: [],
      },
    },
  });
  const svc = createSqlService(client);
  const rows = await svc.runSql("SELECT TOP 2 CardCode FROM OCRD");
  assert.deepEqual(rows, [{ CardCode: "C1" }, { CardCode: "C2" }]);
  assert.deepEqual(client.calls[0], {
    method: "POST",
    path: "/sql_query",
    body: { sql: "SELECT TOP 2 CardCode FROM OCRD" },
  });
});

test("runSql: acepta WITH (CTE) y espacios iniciales", async () => {
  const client = createFakePort();
  const svc = createSqlService(client);
  await svc.runSql("\n  WITH x AS (SELECT 1 AS a) SELECT * FROM x");
  assert.equal(client.calls.length, 1);
});

test("runSql: rechaza sentencias que no son solo lectura sin llamar al cliente", async () => {
  const client = createFakePort();
  const svc = createSqlService(client);
  for (const sql of [
    "INSERT INTO OCRD (CardCode) VALUES ('X')",
    "UPDATE OCRD SET CardName = 'x'",
    "DELETE FROM OCRD",
    "EXEC sp_who",
    "DROP TABLE OCRD",
    "SELECT * FROM OCRD; DROP TABLE OCRD",
    "",
  ]) {
    await assert.rejects(async () => svc.runSql(sql), InvalidArgumentError);
  }
  assert.equal(client.calls.length, 0);
});

test("runSql: 'Service Not Found' (v1 antiguos) se mapea a error claro", async () => {
  const client = createFakePort({
    responses: {
      "POST /sql_query": {
        status: 400,
        body: { error: { code: -1002, message: { lang: "en-us", value: "Service Not Found" } } },
        text: "",
        setCookies: [],
      },
    },
  });
  const svc = createSqlService(client);
  await assert.rejects(
    async () => svc.runSql("SELECT 1"),
    (e) => e instanceof InvalidArgumentError && /SQL no soportado/.test(e.message)
  );
});

test("runSql: otros errores HTTP se propagan como ServiceLayerError", async () => {
  const client = createFakePort({
    responses: {
      "POST /sql_query": {
        status: 500,
        body: { error: { message: { value: "boom" } } },
        text: "",
        setCookies: [],
      },
    },
  });
  const svc = createSqlService(client);
  await assert.rejects(async () => svc.runSql("SELECT 1"), ServiceLayerError);
});
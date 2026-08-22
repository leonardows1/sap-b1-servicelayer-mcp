import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHttpClient } from "../src/infrastructure/http/httpClient.js";
import { ServiceLayerClient } from "../src/infrastructure/http/serviceLayerClient.js";

const SESSION_COOKIE = "B1SESSION=test-session; Path=/";

/** @type {import("node:http").Server|null} */
let server = null;
/** @type {string} */
let baseUrl = "";

before(async () => {
  const srv = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/b1s/v1/Login") {
      res.setHeader("Set-Cookie", [SESSION_COOKIE]);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
      return;
    }
    if (req.method === "POST" && req.url === "/b1s/v1/Logout") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
      return;
    }
    if (req.method === "GET" && req.url === "/b1s/v1/data") {
      if (!req.headers.cookie?.includes("B1SESSION=test-session")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: { value: "No active session" } } }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ value: [{ id: 1 }] }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end("{}");
  });
  server = srv;
  await new Promise((/** @type {(value?: unknown) => void} */ resolve) => srv.listen(0, "127.0.0.1", () => resolve()));
  const addr = srv.address();
  assert.ok(addr && typeof addr !== "string");
  baseUrl = `http://127.0.0.1:${addr.port}/b1s/v1`;
});

after(async () => {
  await new Promise((/** @type {(value?: unknown) => void} */ resolve) => server?.close(() => resolve()));
});

function makeClient() {
  const httpClient = createHttpClient({ baseUrl, verifyTls: false, timeoutMs: 5000 });
  return new ServiceLayerClient(httpClient, {
    database: "SBO_TEST",
    username: "user",
    password: "pass",
  });
}

test("login implícito establece la sesión", async () => {
  const client = makeClient();
  assert.equal(client.hasSession(), false);
  assert.equal(await client.ensureSession(), true);
  assert.equal(client.hasSession(), true);
  assert.equal(typeof client.sessionAgeSeconds(), "number");
});

test("authorizedRequest reintenta tras 401 con la cookie", async () => {
  const client = makeClient();
  const res = await client.authorizedRequest("GET", "/data");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { value: [{ id: 1 }] });
});

test("logout cierra la sesión y limpia el estado", async () => {
  const client = makeClient();
  await client.ensureSession();
  const status = await client.logout();
  assert.equal(status, 200);
  assert.equal(client.hasSession(), false);
  assert.equal(await client.logout(), null);
  assert.equal(client.sessionAgeSeconds(), null);
});
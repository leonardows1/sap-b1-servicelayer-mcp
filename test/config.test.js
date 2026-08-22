import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/config.js";
import { ConfigurationError } from "../src/domain/errors.js";

const BASE = {
  SAP_B1_SERVER_URL: "https://host:50000/b1s/v1",
  SAP_B1_DATABASE: "SBO_DEMO",
  SAP_B1_USERNAME: "user",
  SAP_B1_PASSWORD: "pass",
};

test("config: URL base sin barras finales y defaults", () => {
  const cfg = loadConfig({ ...BASE, SAP_B1_SERVER_URL: "https://host:50000/b1s/v1///" });
  assert.equal(cfg.baseUrl, "https://host:50000/b1s/v1");
  assert.equal(cfg.database, "SBO_DEMO");
  assert.equal(cfg.verifyTls, true);
  assert.equal(cfg.readonly, true);
  assert.equal(cfg.maxTop, 200);
  assert.equal(cfg.timeoutMs, 30000);
  assert.equal(Object.isFrozen(cfg), true);
});

test("config: sin SAP_B1_SERVER_URL lanza ConfigurationError", () => {
  assert.throws(() => loadConfig({}), ConfigurationError);
  assert.throws(() => loadConfig({ SAP_B1_SERVER_URL: "  " }), ConfigurationError);
});

test("config: booleanos — solo 'false' es falsy", () => {
  assert.equal(loadConfig({ ...BASE, SAP_B1_VERIFY_TLS: "false" }).verifyTls, false);
  assert.equal(loadConfig({ ...BASE, SAP_B1_VERIFY_TLS: "FALSE" }).verifyTls, false);
  assert.equal(loadConfig({ ...BASE, SAP_B1_VERIFY_TLS: "0" }).verifyTls, true);
  assert.equal(loadConfig({ ...BASE, SAP_B1_READONLY: "false" }).readonly, false);
  assert.equal(loadConfig({ ...BASE, SAP_B1_READONLY: "true" }).readonly, true);
});

test("config: maxTop válido, inválido y ausente", () => {
  assert.equal(loadConfig({ ...BASE, SAP_B1_MAX_TOP: "50" }).maxTop, 50);
  assert.equal(loadConfig({ ...BASE, SAP_B1_MAX_TOP: "abc" }).maxTop, 200);
  assert.equal(loadConfig({ ...BASE, SAP_B1_MAX_TOP: "-5" }).maxTop, 200);
  assert.equal(loadConfig(BASE).maxTop, 200);
});
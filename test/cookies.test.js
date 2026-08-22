import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSetCookie, mergeCookies, findCookie } from "../src/infrastructure/http/cookies.js";

test("parseSetCookie: parses nombre=valor", () => {
  assert.deepEqual(parseSetCookie("B1SESSION=abc123; Path=/; HttpOnly"), {
    name: "B1SESSION",
    value: "abc123",
  });
});

test("parseSetCookie: rechaza formatos inválidos", () => {
  assert.equal(parseSetCookie("=value"), null);
  assert.equal(parseSetCookie("noequals"), null);
});

test("mergeCookies: acumula y reemplaza por nombre", () => {
  let header = mergeCookies(null, ["B1SESSION=abc; Path=/"]);
  assert.equal(header, "B1SESSION=abc");

  header = mergeCookies(header, ["ROUTEID=node2; Path=/"]);
  assert.equal(header, "B1SESSION=abc; ROUTEID=node2");

  header = mergeCookies(header, ["B1SESSION=def; Path=/"]);
  assert.equal(header, "ROUTEID=node2; B1SESSION=def");
});

test("mergeCookies: sin set-cookie conserva el estado", () => {
  assert.equal(mergeCookies("A=1", []), "A=1");
  assert.equal(mergeCookies(null, []), "");
});

test("findCookie: localiza por nombre", () => {
  assert.equal(findCookie("A=1; B1SESSION=xyz", "B1SESSION"), "xyz");
  assert.equal(findCookie("A=1; B1SESSION=xyz", "A"), "1");
  assert.equal(findCookie("A=1; B1SESSION=xyz", "NOPE"), null);
  assert.equal(findCookie(null, "A"), null);
});
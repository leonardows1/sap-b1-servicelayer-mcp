import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampTop,
  composeFilter,
  eq,
  escapeODataString,
  isValidEntityName,
  buildQueryString,
} from "../src/domain/oData.js";

test("clampTop: acota al rango [1, maxTop]", () => {
  assert.equal(clampTop(5, 200), 5);
  assert.equal(clampTop(0, 200), 1);
  assert.equal(clampTop(-3, 200), 1);
  assert.equal(clampTop(500, 200), 200);
  assert.equal(clampTop("10", 200), 10);
  assert.equal(clampTop("abc", 200), null);
});

test("composeFilter: une con 'and' y descarta nulos", () => {
  assert.equal(composeFilter("a eq 1", "b eq 2"), "a eq 1 and b eq 2");
  assert.equal(composeFilter("a eq 1", null, "b eq 2"), "a eq 1 and b eq 2");
  assert.equal(composeFilter(null, undefined), undefined);
  assert.equal(composeFilter(), undefined);
});

test("eq: construye igualdad OData", () => {
  assert.equal(eq("CardType", "cCustomer"), "CardType eq 'cCustomer'");
  assert.equal(eq("ItemCode", "PV-100"), "ItemCode eq 'PV-100'");
});

test("eq: escapa comillas simples del valor (anti-inyección)", () => {
  assert.equal(eq("ItemCode", "A'B"), "ItemCode eq 'A''B'");
  assert.equal(eq("ItemCode", 42), "ItemCode eq '42'");
});

test("escapeODataString: duplica comillas simples", () => {
  assert.equal(escapeODataString("simple"), "simple");
  assert.equal(escapeODataString("O'Reilly"), "O''Reilly");
  assert.equal(escapeODataString("a'b'c"), "a''b''c");
});

test("isValidEntityName: acepta identificadores válidos y rechaza el resto", () => {
  assert.equal(isValidEntityName("BusinessPartners"), true);
  assert.equal(isValidEntityName("ItemStock"), true);
  assert.equal(isValidEntityName("BP_2"), true);
  assert.equal(isValidEntityName("@MYPORTAL"), true);
  assert.equal(isValidEntityName("@UDO_Order"), true);
  assert.equal(isValidEntityName(""), false);
  assert.equal(isValidEntityName("Orders/items"), false);
  assert.equal(isValidEntityName("Items('x')"), false);
  assert.equal(isValidEntityName("../etc"), false);
  assert.equal(isValidEntityName("2Items"), false);
  assert.equal(isValidEntityName("@"), false);
  assert.equal(isValidEntityName("@@X"), false);
  assert.equal(isValidEntityName("@2X"), false);
  assert.equal(isValidEntityName(null), false);
  assert.equal(isValidEntityName(42), false);
});

test("buildQueryString: sin opciones devuelve cadena vacía", () => {
  assert.equal(buildQueryString({ maxTop: 200 }), "");
});

test("buildQueryString: serializa todas las opciones", () => {
  const qs = buildQueryString({
    select: "CardCode,CardName",
    filter: "CardType eq 'cCustomer'",
    top: 10,
    skip: 5,
    orderby: "CardName asc",
    expand: "Items",
    maxTop: 200,
  });
  assert.equal(
    qs,
    "?%24select=CardCode%2CCardName&%24filter=CardType+eq+%27cCustomer%27&%24top=10&%24skip=5&%24orderby=CardName+asc&%24expand=Items"
  );
});

test("buildQueryString: acota top y omite valores ausentes", () => {
  assert.equal(buildQueryString({ top: 999, maxTop: 200 }), "?%24top=200");
  assert.equal(buildQueryString({ top: 0, maxTop: 200 }), "?%24top=1");
  assert.equal(buildQueryString({ skip: 20, maxTop: 200 }), "?%24skip=20");
});
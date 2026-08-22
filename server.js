#!/usr/bin/env node
import http from "node:http";
import https from "node:https";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.SAP_B1_SERVER_URL || "").replace(/\/+$/, "");
const COMPANY_DB = process.env.SAP_B1_DATABASE || "";
const USERNAME = process.env.SAP_B1_USERNAME || "";
const PASSWORD = process.env.SAP_B1_PASSWORD || "";
const VERIFY_TLS = (process.env.SAP_B1_VERIFY_TLS || "true").toLowerCase() !== "false";
const READONLY = (process.env.SAP_B1_READONLY || "true").toLowerCase() !== "false";
const MAX_TOP = parseInt(process.env.SAP_B1_MAX_TOP || "200", 10);

if (!BASE_URL) {
  console.error("SAP_B1_SERVER_URL no configurado");
  process.exit(1);
}

let sessionCookie = null; // todas las cookies (B1SESSION + ROUTEID + otras)
let b1session = null; // valor de B1SESSION; null = sin sesión activa
let sessionStartedAt = null;

const sharedAgent = new https.Agent({ keepAlive: true, maxSockets: 1, rejectUnauthorized: VERIFY_TLS });

function request(method, path, body = null, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const transport = url.protocol === "http:" ? http : https;
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
    };
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "http:" ? 80 : 443),
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        agent: url.protocol === "https:" ? sharedAgent : undefined,
        rejectUnauthorized: VERIFY_TLS,
        timeout,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          for (const sc of res.headers["set-cookie"] || []) {
            const first = sc.split(";")[0].trim();
            const eq = first.indexOf("=");
            if (eq <= 0) continue;
            const name = first.slice(0, eq);
            const value = first.slice(eq + 1);
            const cookies = sessionCookie ? sessionCookie.split("; ") : [];
            sessionCookie = [...cookies.filter((c) => !c.startsWith(`${name}=`)), `${name}=${value}`].join("; ");
            if (name === "B1SESSION") {
              b1session = value;
              sessionStartedAt = Date.now();
            }
          }
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function hasSession() {
  return b1session !== null;
}

function ensureSession() {
  if (hasSession()) return Promise.resolve(true);
  return request("POST", "/Login", {
    CompanyDB: COMPANY_DB,
    UserName: USERNAME,
    Password: PASSWORD,
  }).then((res) => res.status === 200 && b1session !== null);
}

async function requestWithRetry(method, path, body = null) {
  let res = await request(method, path, body);
  if (res.status === 401 && (await ensureSession())) {
    res = await request(method, path, body);
  }
  return res;
}

function errorMessage(res) {
  return res.body?.error?.message?.value || `HTTP ${res.status}`;
}

async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${path}?${qs}` : path;
  const res = await requestWithRetry("GET", url);
  if (res.status !== 200) {
    throw new Error(`ServiceLayer HTTP ${res.status}: ${errorMessage(res)}`);
  }
  return res.body?.value ?? res.body;
}

async function sendBody(method, path, body) {
  const res = await requestWithRetry(method, path, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`ServiceLayer HTTP ${res.status}: ${errorMessage(res)}`);
  }
  return res.body;
}

async function sapQuery(entity, select, filter, top, skip, orderby, expand) {
  if (!entity) throw new Error("entity es requerido");
  const params = {};
  if (select) params.$select = select;
  if (filter) params.$filter = filter;
  if (top != null) params.$top = String(Math.min(Math.max(parseInt(top, 10), 1), MAX_TOP));
  if (skip != null) params.$skip = String(parseInt(skip, 10));
  if (orderby) params.$orderby = orderby;
  if (expand) params.$expand = expand;
  const result = await get(`/${entity}`, params);
  return JSON.stringify(result, null, 2);
}

function ok(text) {
  return { content: [{ type: "text", text }] };
}

function err(e) {
  return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
}

const server = new McpServer({ name: "sap-b1-servicelayer", version: "1.0.1" });

server.tool(
  "sap_query",
  "Consulta GET genérica a cualquier entidad del ServiceLayer. Ejemplos de entity: BusinessPartners, Items, Orders, PurchaseOrders, Invoices, ItemStock, Warehouses. Uso típico: sap_query('BusinessPartners', select='CardCode,CardName', top=10).",
  {
    entity: z.string().describe("Entidad OData a consultar (ej: BusinessPartners)"),
    select: z.string().optional().describe("Campos a seleccionar separados por coma"),
    filter: z.string().optional().describe("Expresión OData $filter"),
    top: z.number().int().min(1).max(MAX_TOP).optional().describe("Máximo de registros"),
    skip: z.number().int().min(0).optional().describe("Registros a omitir"),
    orderby: z.string().optional().describe("Orden OData $orderby"),
    expand: z.string().optional().describe("Entidades anidadas $expand"),
  },
  async ({ entity, select, filter, top, skip, orderby, expand }) => {
    try {
      return ok(await sapQuery(entity, select, filter, top, skip, orderby, expand));
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "sap_get_business_partners",
  "Lista de socios de negocio (clientes/proveedores) de SAP B1. card_type: cCustomer, cSupplier o cLid.",
  {
    filter: z.string().optional(),
    select: z.string().optional(),
    top: z.number().int().min(1).max(MAX_TOP).optional().default(10),
    card_type: z.enum(["cCustomer", "cSupplier", "cLid"]).optional(),
  },
  async ({ filter, select, top, card_type }) => {
    try {
      if (card_type) {
        filter = filter ? `${filter} and CardType eq '${card_type}'` : `CardType eq '${card_type}'`;
      }
      return ok(await sapQuery("BusinessPartners", select, filter, top, null, null, null));
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "sap_get_items",
  "Lista de artículos del catálogo de SAP B1.",
  {
    filter: z.string().optional(),
    select: z.string().optional(),
    top: z.number().int().min(1).max(MAX_TOP).optional().default(10),
  },
  async ({ filter, select, top }) => {
    try {
      return ok(await sapQuery("Items", select, filter, top, null, null, null));
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "sap_get_sales_orders",
  "Pedidos de venta (Sales Orders) de SAP B1. expand sugerido: 'DocumentLines'.",
  {
    filter: z.string().optional(),
    select: z.string().optional(),
    top: z.number().int().min(1).max(MAX_TOP).optional().default(10),
    expand: z.string().optional(),
  },
  async ({ filter, select, top, expand }) => {
    try {
      return ok(await sapQuery("Orders", select, filter, top, null, null, expand));
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "sap_get_stock",
  "Stock disponible de un artículo (ItemStock) en SAP B1. warehouse opcional (ej: '01').",
  {
    item_code: z.string().describe("Código del artículo"),
    warehouse: z.string().optional().describe("Código de almacén"),
  },
  async ({ item_code, warehouse }) => {
    try {
      let filter = `ItemCode eq '${item_code}'`;
      if (warehouse) filter += ` and WarehouseCode eq '${warehouse}'`;
      return ok(await sapQuery("ItemStock", "ItemCode,WarehouseCode,Quantity,CommittedQuantity,OnHand", filter, 10, null, null, null));
    } catch (e) {
      return err(e);
    }
  }
);

server.tool("sap_session_status", "Estado de la sesión actual contra el ServiceLayer de SAP B1.", {}, async () => {
  try {
    if (!hasSession()) {
      return ok(JSON.stringify({ connected: false, detail: "Sin sesión activa" }));
    }
    const res = await request("GET", "/");
    const age = sessionStartedAt ? Math.round((Date.now() - sessionStartedAt) / 1000) : null;
    return ok(JSON.stringify({ connected: true, http: res.status, session_age_sec: age }));
  } catch (e) {
    return err(e);
  }
});

server.tool("sap_logout", "Cierra la sesión activa contra el ServiceLayer de SAP B1.", {}, async () => {
  try {
    if (!hasSession()) {
      return ok(JSON.stringify({ logged_out: false, detail: "No había sesión activa" }));
    }
    const res = await requestWithRetry("POST", "/Logout");
    sessionCookie = null;
    b1session = null;
    sessionStartedAt = null;
    return ok(JSON.stringify({ logged_out: true, http: res.status }));
  } catch (e) {
    return err(e);
  }
});

if (!READONLY) {
  server.tool(
    "sap_create",
    "Crea un registro en una entidad del ServiceLayer (POST). Solo disponible cuando SAP_B1_READONLY=false.",
    {
      entity: z.string().describe("Entidad OData (ej: BusinessPartners, Orders, Items)"),
      payload: z.record(z.any()).describe("Objeto JSON con los campos a crear"),
    },
    async ({ entity, payload }) => {
      try {
        const result = await sendBody("POST", `/${entity}`, payload);
        return ok(JSON.stringify(result, null, 2));
      } catch (e) {
        return err(e);
      }
    }
  );

  server.tool(
    "sap_update",
    "Actualiza un registro en una entidad del ServiceLayer por su clave (PATCH). Solo disponible cuando SAP_B1_READONLY=false.",
    {
      entity: z.string().describe("Entidad OData (ej: BusinessPartners, Orders)"),
      id: z.string().describe("Clave del registro (ej: CardCode, DocEntry)"),
      payload: z.record(z.any()).describe("Objeto JSON con los campos a actualizar"),
    },
    async ({ entity, id, payload }) => {
      try {
        const result = await sendBody("PATCH", `/${entity}('${id}')`, payload);
        return ok(JSON.stringify(result, null, 2));
      } catch (e) {
        return err(e);
      }
    }
  );

  server.tool(
    "sap_delete",
    "Elimina un registro de una entidad del ServiceLayer por su clave (DELETE). Solo disponible cuando SAP_B1_READONLY=false.",
    {
      entity: z.string().describe("Entidad OData (ej: BusinessPartners)"),
      id: z.string().describe("Clave del registro (ej: CardCode, DocEntry)"),
    },
    async ({ entity, id }) => {
      try {
        const result = await sendBody("DELETE", `/${entity}('${id}')`, null);
        return ok(JSON.stringify(result ?? { deleted: true }, null, 2));
      } catch (e) {
        return err(e);
      }
    }
  );
}

async function main() {
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
  } finally {
    if (hasSession()) {
      try {
        await request("POST", "/Logout");
      } catch {
        // ignorar
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
import { z } from "zod";
import { handle, serialize } from "./result.js";

/**
 * Registro de tools MCP (controladores delgados).
 * Cada tool valida argumentos con zod, delega en un caso de uso y serializa.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {object} deps
 * @param {ReturnType<import("../../application/services/queryService.js")["createQueryService"]>} deps.queryService
 * @param {ReturnType<import("../../application/services/catalogService.js")["createCatalogService"]>} deps.catalogService
 * @param {ReturnType<import("../../application/services/salesService.js")["createSalesService"]>} deps.salesService
 * @param {ReturnType<import("../../application/services/sessionService.js")["createSessionService"]>} deps.sessionService
 * @param {ReturnType<import("../../application/services/writeService.js")["createWriteService"]>} deps.writeService
 * @param {ReturnType<import("../../application/services/metadataService.js")["createMetadataService"]>} deps.metadataService
 * @param {number} deps.maxTop límite máximo de $top (schema zod)
 * @param {boolean} deps.readonly si true, no registra tools de escritura
 */
export function registerTools(
  server,
  { queryService, catalogService, salesService, sessionService, writeService, metadataService, maxTop, readonly }
) {
  const top = z.number().int().min(1).max(maxTop).optional();
  const topWithDefault = top.default(10);

  server.tool(
    "sap_query",
    "Consulta GET genérica a cualquier entidad del ServiceLayer. Ejemplos de entity: BusinessPartners, Items, Orders, PurchaseOrders, Invoices, ItemStock, Warehouses. Uso típico: sap_query('BusinessPartners', select='CardCode,CardName', top=10).",
    {
      entity: z.string().describe("Entidad OData a consultar (ej: BusinessPartners)"),
      select: z.string().optional().describe("Campos a seleccionar separados por coma"),
      filter: z.string().optional().describe("Expresión OData $filter"),
      top: z.number().int().min(1).max(maxTop).optional().describe("Máximo de registros"),
      skip: z.number().int().min(0).optional().describe("Registros a omitir"),
      orderby: z.string().optional().describe("Orden OData $orderby"),
      expand: z.string().optional().describe("Entidades anidadas $expand"),
    },
    handle(async ({ entity, select, filter, top, skip, orderby, expand }) =>
      serialize(await queryService.query(entity, { select, filter, top, skip, orderby, expand }))
    )
  );

  server.tool(
    "sap_get_business_partners",
    "Lista de socios de negocio (clientes/proveedores) de SAP B1. card_type: cCustomer, cSupplier o cLid.",
    {
      filter: z.string().optional(),
      select: z.string().optional(),
      top: topWithDefault,
      card_type: z.enum(["cCustomer", "cSupplier", "cLid"]).optional(),
    },
    handle(async ({ filter, select, top, card_type }) =>
      serialize(await catalogService.getBusinessPartners({ filter, select, top, cardType: card_type }))
    )
  );

  server.tool(
    "sap_get_items",
    "Lista de artículos del catálogo de SAP B1.",
    {
      filter: z.string().optional(),
      select: z.string().optional(),
      top: topWithDefault,
    },
    handle(async ({ filter, select, top }) =>
      serialize(await catalogService.getItems({ filter, select, top }))
    )
  );

  server.tool(
    "sap_get_sales_orders",
    "Pedidos de venta (Sales Orders) de SAP B1. expand sugerido: 'DocumentLines'.",
    {
      filter: z.string().optional(),
      select: z.string().optional(),
      top: topWithDefault,
      expand: z.string().optional(),
    },
    handle(async ({ filter, select, top, expand }) =>
      serialize(await salesService.getSalesOrders({ filter, select, top, expand }))
    )
  );

  server.tool(
    "sap_get_stock",
    "Stock disponible de un artículo (ItemStock) en SAP B1. warehouse opcional (ej: '01').",
    {
      item_code: z.string().describe("Código del artículo"),
      warehouse: z.string().optional().describe("Código de almacén"),
    },
    handle(async ({ item_code, warehouse }) =>
      serialize(await salesService.getStock({ itemCode: item_code, warehouse }))
    )
  );

  server.tool(
    "sap_list_entities",
    "Lista todas las entidades OData expuestas por el ServiceLayer (desde $metadata, cacheado). Incluye tablas de usuario (prefijo @) y UDOs. filter: substring opcional para acotar.",
    {
      filter: z.string().optional().describe("Substring para acotar por nombre"),
    },
    handle(async ({ filter }) => serialize(await metadataService.listEntities(filter)))
  );

  server.tool(
    "sap_get_entity_schema",
    "Esquema de una entidad del ServiceLayer (propiedades, tipos y claves) para guiar $select y $filter. Ejemplo: sap_get_entity_schema('Orders').",
    {
      entity: z.string().describe("Entidad OData (ej: Orders, BusinessPartners, @MYPORTAL)"),
    },
    handle(async ({ entity }) => serialize(await metadataService.getEntitySchema(entity)))
  );

  server.tool(
    "sap_list_actions",
    "Lista los métodos de servicio (function imports) del ServiceLayer, con sus parámetros y tipo de retorno. Ejemplos: CompanyService_GetCompanyInfo, AccountCategoryService_GetCategoryList.",
    {
      filter: z.string().optional().describe("Substring para acotar por nombre"),
    },
    handle(async ({ filter }) => serialize(await metadataService.listActions(filter)))
  );

  server.tool(
    "sap_session_status",
    "Estado de la sesión actual contra el ServiceLayer de SAP B1.",
    {},
    handle(async () => serialize(await sessionService.status()))
  );

  server.tool(
    "sap_logout",
    "Cierra la sesión activa contra el ServiceLayer de SAP B1.",
    {},
    handle(async () => serialize(await sessionService.logout()))
  );

  if (readonly) return;

  server.tool(
    "sap_call_action",
    "Invoca un método de servicio del ServiceLayer (POST). Los function imports pueden tener efectos colaterales (Cancel, UpdateCompanyInfo, Import...). Solo disponible cuando SAP_B1_READONLY=false. Lista los métodos con sap_list_actions.",
    {
      action: z.string().describe("Nombre del function import (ej: CompanyService_GetCompanyInfo)"),
      params: z
        .record(z.any())
        .optional()
        .describe("Parámetros nombrados del método (ej: { PeriodCategoryParams: { AbsoluteEntry: 1 } })"),
    },
    handle(async ({ action, params }) => serialize(await metadataService.callAction(action, params ?? {})))
  );

  server.tool(
    "sap_create",
    "Crea un registro en una entidad del ServiceLayer (POST). Solo disponible cuando SAP_B1_READONLY=false.",
    {
      entity: z.string().describe("Entidad OData (ej: BusinessPartners, Orders, Items)"),
      payload: z.record(z.any()).describe("Objeto JSON con los campos a crear"),
    },
    handle(async ({ entity, payload }) => serialize(await writeService.create(entity, payload)))
  );

  server.tool(
    "sap_update",
    "Actualiza un registro en una entidad del ServiceLayer por su clave (PATCH). Solo disponible cuando SAP_B1_READONLY=false.",
    {
      entity: z.string().describe("Entidad OData (ej: BusinessPartners, Orders)"),
      id: z.string().describe("Clave del registro (ej: CardCode, DocEntry)"),
      payload: z.record(z.any()).describe("Objeto JSON con los campos a actualizar"),
    },
    handle(async ({ entity, id, payload }) =>
      serialize(await writeService.update(entity, id, payload))
    )
  );

  server.tool(
    "sap_delete",
    "Elimina un registro de una entidad del ServiceLayer por su clave (DELETE). Solo disponible cuando SAP_B1_READONLY=false.",
    {
      entity: z.string().describe("Entidad OData (ej: BusinessPartners)"),
      id: z.string().describe("Clave del registro (ej: CardCode, DocEntry)"),
    },
    handle(async ({ entity, id }) => serialize(await writeService.remove(entity, id)))
  );
}
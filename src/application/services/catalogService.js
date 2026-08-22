import { composeFilter, eq } from "../../domain/oData.js";

/**
 * Casos de uso: consultas del catálogo de SAP B1 (socios de negocio y artículos).
 * Cada método compone filtros OData y delega en QueryService (SRP + composición).
 *
 * @typedef {object} CatalogService
 * @property {(args?: {filter?: string, select?: string, top?: unknown, cardType?: "cCustomer"|"cSupplier"|"cLid"}) => Promise<unknown>} getBusinessPartners
 * @property {(args?: {filter?: string, select?: string, top?: unknown}) => Promise<unknown>} getItems
 */

/**
 * @param {import("./queryService.js").QueryService} queryService
 * @returns {CatalogService}
 */
export function createCatalogService(queryService) {
  return {
    /**
     * @param {object} [args]
     * @param {string} [args.filter] filtro OData adicional
     * @param {string} [args.select]
     * @param {unknown} [args.top]
     * @param {"cCustomer"|"cSupplier"|"cLid"} [args.cardType]
     * @returns {Promise<unknown>}
     */
    getBusinessPartners({ filter, select, top, cardType } = {}) {
      return queryService.query("BusinessPartners", {
        select,
        top,
        filter: cardType ? composeFilter(filter, eq("CardType", cardType)) : filter,
      });
    },

    /**
     * @param {object} [args]
     * @param {string} [args.filter]
     * @param {string} [args.select]
     * @param {unknown} [args.top]
     * @returns {Promise<unknown>}
     */
    getItems({ filter, select, top } = {}) {
      return queryService.query("Items", { filter, select, top });
    },
  };
}
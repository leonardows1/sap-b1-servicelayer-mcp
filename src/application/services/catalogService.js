import { composeFilter, eq } from "../../domain/oData.js";

/**
 * Casos de uso: consultas del catálogo de SAP B1 (socios de negocio y artículos).
 * Cada método compone filtros OData y delega en QueryService (SRP + composición).
 *
 * @param {ReturnType<import("./queryService.js")["createQueryService"]>} queryService
 */
export function createCatalogService(queryService) {
  return {
    /**
     * @param {object} [args]
     * @param {string} [args.filter] filtro OData adicional
     * @param {string} [args.select]
     * @param {unknown} [args.top]
     * @param {"cCustomer"|"cSupplier"|"cLid"} [args.cardType]
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
     */
    getItems({ filter, select, top } = {}) {
      return queryService.query("Items", { filter, select, top });
    },
  };
}
import { InvalidArgumentError } from "../../domain/errors.js";
import { composeFilter, eq } from "../../domain/oData.js";

/**
 * Casos de uso: consultas comerciales (pedidos de venta y stock).
 *
 * @typedef {object} SalesService
 * @property {(args?: {filter?: string, select?: string, top?: unknown, expand?: string}) => Promise<unknown>} getSalesOrders
 * @property {(args?: {itemCode?: string, warehouse?: string}) => Promise<unknown>} getStock
 */

/**
 * Dependencia mínima de metadata (DIP): solo se usa para validar la
 * existencia de ItemStock y sugerir entidades de stock alternativas.
 *
 * @typedef {object} MetadataServiceLike
 * @property {(name: string) => Promise<boolean>} entityExists
 * @property {(filter?: string) => Promise<{entities: Array<{name: string}>}>} listEntities
 */

/**
 * @param {import("./queryService.js").QueryService} queryService
 * @param {MetadataServiceLike} [metadataService]
 *   opcional: valida que ItemStock exista (no existe en ServiceLayer v1 antiguos)
 * @returns {SalesService}
 */
export function createSalesService(queryService, metadataService) {
  const STOCK_SELECT = "ItemCode,WarehouseCode,Quantity,CommittedQuantity,OnHand";

  /**
   * Sugiere entidades de stock reales descubiertas en $metadata.
   * @returns {Promise<string>}
   */
  async function stockSuggestions() {
    if (!metadataService) return "";
    const { entities } = await metadataService.listEntities();
    const names = entities
      .map((e) => e.name)
      .filter((n) => /stock|warehouse|inventory/i.test(n))
      .slice(0, 6)
      .join(", ");
    return names ? ` Entidades de stock disponibles: ${names}.` : "";
  }

  return {
    /**
     * @param {object} [args]
     * @param {string} [args.filter]
     * @param {string} [args.select]
     * @param {unknown} [args.top]
     * @param {string} [args.expand] entidades anidadas (ej: DocumentLines; en v1
     *   las líneas de documento son complex types e vienen incluidas sin expand)
     * @returns {Promise<unknown>}
     */
    getSalesOrders({ filter, select, top, expand } = {}) {
      return queryService.query("Orders", { filter, select, top, expand });
    },

    /**
     * @param {object} [args]
     * @param {string} [args.itemCode]
     * @param {string} [args.warehouse]
     * @returns {Promise<unknown>}
     */
    async getStock({ itemCode, warehouse } = {}) {
      if (metadataService && !(await metadataService.entityExists("ItemStock"))) {
        throw new InvalidArgumentError(
          `La entidad ItemStock no existe en este ServiceLayer.${await stockSuggestions()}`
        );
      }
      const filter = composeFilter(
        itemCode ? eq("ItemCode", itemCode) : null,
        warehouse ? eq("WarehouseCode", warehouse) : null
      );
      return queryService.query("ItemStock", { select: STOCK_SELECT, filter, top: 10 });
    },
  };
}
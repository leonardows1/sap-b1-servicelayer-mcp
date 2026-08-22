import { composeFilter, eq } from "../../domain/oData.js";

/**
 * Casos de uso: consultas comerciales (pedidos de venta y stock).
 *
 * @param {ReturnType<import("./queryService.js")["createQueryService"]>} queryService
 */
export function createSalesService(queryService) {
  const STOCK_SELECT = "ItemCode,WarehouseCode,Quantity,CommittedQuantity,OnHand";

  return {
    /**
     * @param {object} [args]
     * @param {string} [args.filter]
     * @param {string} [args.select]
     * @param {unknown} [args.top]
     * @param {string} [args.expand] entidades anidadas (ej: DocumentLines)
     */
    getSalesOrders({ filter, select, top, expand } = {}) {
      return queryService.query("Orders", { filter, select, top, expand });
    },

    /**
     * @param {object} args
     * @param {string} args.itemCode
     * @param {string} [args.warehouse]
     */
    getStock({ itemCode, warehouse } = {}) {
      const filter = composeFilter(
        eq("ItemCode", itemCode),
        warehouse ? eq("WarehouseCode", warehouse) : null
      );
      return queryService.query("ItemStock", { select: STOCK_SELECT, filter, top: 10 });
    },
  };
}
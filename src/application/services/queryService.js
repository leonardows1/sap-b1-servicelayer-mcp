import { InvalidArgumentError } from "../../domain/errors.js";
import { buildQueryString, isValidEntityName } from "../../domain/oData.js";
import { ensureOk, unwrapValue } from "../helpers.js";

/**
 * Caso de uso: consulta GET genérica a una entidad OData del ServiceLayer.
 *
 * @param {import("../ports.js").ServiceLayerPort} client
 * @param {number} maxTop límite máximo de $top
 */
export function createQueryService(client, maxTop) {
  return {
    /**
     * @param {string} entity entidad OData (ej: BusinessPartners)
     * @param {object} [options]
     * @returns {Promise<unknown>} arreglo desenvuelto (`value`) o el cuerpo de la respuesta
     */
    async query(entity, options = {}) {
      if (!isValidEntityName(entity)) {
        throw new InvalidArgumentError(`entity inválida: ${entity}`);
      }
      const res = await client.authorizedRequest(
        "GET",
        `/${entity}${buildQueryString({ ...options, maxTop })}`
      );
      ensureOk(res);
      return unwrapValue(res.body);
    },
  };
}
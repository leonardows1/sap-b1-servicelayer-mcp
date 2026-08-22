import { InvalidArgumentError } from "../../domain/errors.js";
import { buildQueryString, isValidEntityName } from "../../domain/oData.js";
import { ensureOk, unwrapValue } from "../helpers.js";

/**
 * Opciones de una consulta OData.
 *
 * @typedef {object} QueryOptions
 * @property {string} [select]
 * @property {string} [filter]
 * @property {unknown} [top]
 * @property {unknown} [skip]
 * @property {string} [orderby]
 * @property {string} [expand]
 */

/**
 * Caso de uso: consulta GET genérica a una entidad OData del ServiceLayer.
 *
 * @typedef {object} QueryService
 * @property {(entity: string, options?: QueryOptions) => Promise<unknown>} query
 *   Consulta una entidad; devuelve el arreglo desenvuelto (`value`) o el cuerpo.
 */

/**
 * @param {import("../ports.js").ServiceLayerPort} client
 * @param {number} maxTop límite máximo de $top
 * @returns {QueryService}
 */
export function createQueryService(client, maxTop) {
  return {
    /**
     * @param {string} entity entidad OData (ej: BusinessPartners)
     * @param {QueryOptions} [options]
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
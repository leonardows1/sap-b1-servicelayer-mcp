import { InvalidArgumentError } from "../../domain/errors.js";
import { isValidEntityName } from "../../domain/oData.js";
import { parseEntitySets, parseFunctionImports, resolveEntitySchema } from "../../domain/edmx.js";
import { ensureOk, ensureSuccess } from "../helpers.js";

/**
 * Casos de uso: descubrimiento del ServiceLayer vía `$metadata`.
 * El documento EDMX se descarga una única vez por proceso (cacheado en memoria).
 *
 * @typedef {object} EntityLite
 * @property {string} name
 * @property {boolean} userTable true si es tabla de usuario (prefijo @)
 *
 * @typedef {object} EntityList
 * @property {number} total
 * @property {EntityLite[]} entities
 *
 * @typedef {object} ActionList
 * @property {number} total
 * @property {import("../../domain/edmx.js").FunctionImportInfo[]} actions
 *
 * @typedef {object} MetadataService
 * @property {(filter?: string) => Promise<EntityList>} listEntities
 * @property {(entity: string) => Promise<import("../../domain/edmx.js").EntitySchema>} getEntitySchema
 * @property {(name: string) => Promise<boolean>} entityExists
 * @property {(filter?: string) => Promise<ActionList>} listActions
 * @property {(action: string, params?: object) => Promise<unknown>} callAction
 */

/**
 * @param {import("../ports.js").ServiceLayerPort} client
 * @returns {MetadataService}
 */
export function createMetadataService(client) {
  /** @type {Promise<{xml: string, entitySets: import("../../domain/edmx.js").EntitySetInfo[], functionImports: import("../../domain/edmx.js").FunctionImportInfo[]}>|null} */
  let cached = null;

  /**
   * Descarga y parsea $metadata una sola vez (promise memoizada).
   * @returns {Promise<{xml: string, entitySets: import("../../domain/edmx.js").EntitySetInfo[], functionImports: import("../../domain/edmx.js").FunctionImportInfo[]}>}
   */
  function metadata() {
    if (!cached) {
      cached = fetchMetadata();
    }
    return cached;
  }

  /**
   * @returns {Promise<{xml: string, entitySets: import("../../domain/edmx.js").EntitySetInfo[], functionImports: import("../../domain/edmx.js").FunctionImportInfo[]}>}
   */
  async function fetchMetadata() {
    const res = await client.authorizedRequest("GET", "/$metadata");
    ensureOk(res);
    const xml = res.text ?? "";
    return {
      xml,
      entitySets: parseEntitySets(xml),
      functionImports: parseFunctionImports(xml),
    };
  }

  return {
    /**
     * Entidades OData expuestas por el ServiceLayer (incluye UDT/UDO).
     * @param {string} [filter] substring para acotar por nombre
     * @returns {Promise<EntityList>}
     */
    async listEntities(filter) {
      const { entitySets } = await metadata();
      const term = filter?.trim().toLowerCase();
      const entities = entitySets
        .map(({ name }) => ({ name, userTable: name.startsWith("@") }))
        .filter((e) => !term || e.name.toLowerCase().includes(term))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { total: entitySets.length, entities };
    },

    /**
     * Esquema de una entidad (propiedades y claves) para guiar $select/$filter.
     * Resuelve el EntityType real vía el entity set (varios sets comparten tipo).
     * @param {string} entity
     * @returns {Promise<import("../../domain/edmx.js").EntitySchema>}
     */
    async getEntitySchema(entity) {
      if (!isValidEntityName(entity)) {
        throw new InvalidArgumentError(`entity inválida: ${entity}`);
      }
      const { xml, entitySets } = await metadata();
      if (!entitySets.some((s) => s.name === entity)) {
        throw new InvalidArgumentError(`entidad no encontrada en $metadata: ${entity}`);
      }
      const schema = resolveEntitySchema(xml, entity);
      return (
        schema ?? { name: entity, openType: false, properties: [], navigationProperties: [] }
      );
    },

    /**
     * Verifica si un entity set existe en $metadata (sin descargar el esquema).
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    async entityExists(name) {
      const { entitySets } = await metadata();
      return entitySets.some((s) => s.name === name);
    },

    /**
     * Métodos de servicio (function/action imports) disponibles.
     * @param {string} [filter] substring para acotar por nombre
     * @returns {Promise<ActionList>}
     */
    async listActions(filter) {
      const { functionImports } = await metadata();
      const term = filter?.trim().toLowerCase();
      const actions = functionImports
        .filter((a) => a.kind !== "bound")
        .filter((a) => !term || a.name.toLowerCase().includes(term))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { total: functionImports.length, actions };
    },

    /**
     * Invoca un método de servicio (POST). Solo registrado en modo escritura:
     * los function imports pueden tener efectos colaterales.
     * @param {string} action nombre del function import (ej: CompanyService_GetCompanyInfo)
     * @param {object} [params] parámetros nombrados del método
     * @returns {Promise<unknown>} cuerpo de la respuesta, o {success: true} si es vacío
     */
    async callAction(action, params = {}) {
      if (!isValidEntityName(action)) {
        throw new InvalidArgumentError(`action inválida: ${action}`);
      }
      const res = await client.authorizedRequest("POST", `/${action}`, params);
      ensureSuccess(res);
      return res.body ?? { success: true };
    },
  };
}
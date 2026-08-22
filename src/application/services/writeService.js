import { InvalidArgumentError } from "../../domain/errors.js";
import { escapeODataString, isValidEntityName } from "../../domain/oData.js";
import { ensureSuccess } from "../helpers.js";

/**
 * Casos de uso: escrituras en el ServiceLayer (POST/PATCH/DELETE).
 * Solo se registran en el servidor MCP cuando la configuración lo permite.
 *
 * @param {import("../ports.js").ServiceLayerPort} client
 */
export function createWriteService(client) {
  /**
   * @param {"POST"|"PATCH"|"DELETE"} method
   * @param {string} path
   * @param {object|null} body
   * @returns {Promise<object|null>} cuerpo de la respuesta (null en DELETE sin contenido)
   */
  const send = async (method, path, body) => {
    const res = await client.authorizedRequest(method, path, body);
    ensureSuccess(res);
    return res.body;
  };

  /**
   * Valida el nombre de entidad y construye la ruta de recurso con clave
   * escapada OData. Evita inyección de rutas y comillas sin escapar.
   *
   * @param {string} entity
   * @param {string} id
   * @returns {string} ruta, ej: /Orders(123) o /BusinessPartners('C001')
   */
  const resourcePath = (entity, id) => {
    if (!isValidEntityName(entity)) {
      throw new InvalidArgumentError(`entity inválida: ${entity}`);
    }
    if (typeof id !== "string" || id.length === 0) {
      throw new InvalidArgumentError("id es requerido");
    }
    return `/${entity}('${escapeODataString(id)}')`;
  };

  return {
    /**
     * @param {string} entity
     * @param {object} payload
     */
    create: (entity, payload) => {
      if (!isValidEntityName(entity)) {
        throw new InvalidArgumentError(`entity inválida: ${entity}`);
      }
      return send("POST", `/${entity}`, payload);
    },

    /**
     * @param {string} entity
     * @param {string} id clave del registro (ej: CardCode)
     * @param {object} payload
     */
    update: (entity, id, payload) => send("PATCH", resourcePath(entity, id), payload),

    /**
     * @param {string} entity
     * @param {string} id
     * @returns {Promise<{deleted: boolean}>}
     */
    remove: async (entity, id) => {
      await send("DELETE", resourcePath(entity, id), null);
      return { deleted: true };
    },
  };
}
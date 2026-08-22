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

  return {
    /**
     * @param {string} entity
     * @param {object} payload
     */
    create: (entity, payload) => send("POST", `/${entity}`, payload),

    /**
     * @param {string} entity
     * @param {string} id clave del registro (ej: CardCode)
     * @param {object} payload
     */
    update: (entity, id, payload) => send("PATCH", `/${entity}('${id}')`, payload),

    /**
     * @param {string} entity
     * @param {string} id
     */
    remove: (entity, id) => send("DELETE", `/${entity}('${id}')`, null),
  };
}
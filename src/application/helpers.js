import { ServiceLayerError } from "../domain/errors.js";

/**
 * Helpers de la capa de aplicación sobre respuestas del ServiceLayer.
 */

/**
 * Lanza ServiceLayerError si la respuesta no es HTTP 200 (GET).
 * Compatible con el comportamiento histórico del servidor.
 *
 * @param {import("./ports.js").HttpResponse} res
 * @returns {void}
 */
export function ensureOk(res) {
  if (res.status !== 200) throw ServiceLayerError.from(res);
}

/**
 * Lanza ServiceLayerError si la respuesta no es 2xx (escrituras).
 *
 * @param {import("./ports.js").HttpResponse} res
 * @returns {void}
 */
export function ensureSuccess(res) {
  if (res.status < 200 || res.status >= 300) throw ServiceLayerError.from(res);
}

/**
 * Desenvuelve el arreglo OData (`value`) o devuelve el cuerpo tal cual.
 *
 * @param {import("./ports.js").HttpResponse["body"]} body
 * @returns {unknown}
 */
export function unwrapValue(body) {
  const parsed = /** @type {{ value?: unknown } | null} */ (body);
  return parsed?.value ?? body;
}
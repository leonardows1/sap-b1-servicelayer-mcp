import { ServiceLayerError } from "../domain/errors.js";

/**
 * Lanza ServiceLayerError si la respuesta no es HTTP 200 (GET).
 * Compatible con el comportamiento histórico del servidor.
 *
 * @param {{ status: number, body: object|null }} res
 */
export function ensureOk(res) {
  if (res.status !== 200) throw ServiceLayerError.from(res);
}

/**
 * Lanza ServiceLayerError si la respuesta no es 2xx (escrituras).
 *
 * @param {{ status: number, body: object|null }} res
 */
export function ensureSuccess(res) {
  if (res.status < 200 || res.status >= 300) throw ServiceLayerError.from(res);
}

/**
 * Desenvuelve el arreglo OData (`value`) o devuelve el cuerpo tal cual.
 *
 * @param {object|null} body
 * @returns {unknown}
 */
export function unwrapValue(body) {
  return body?.value ?? body;
}
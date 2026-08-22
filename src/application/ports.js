/**
 * Puerto del cliente ServiceLayer (DIP).
 *
 * La capa de aplicación depende de esta abstracción, nunca de la
 * implementación HTTP concreta (ver src/infrastructure/http/serviceLayerClient.js).
 *
 * @typedef {object} ServiceLayerPort
 * @property {(method: string, path: string, body?: object|null) => Promise<{status: number, body: object|null}>} request
 *   HTTP crudo hacia el ServiceLayer. Actualiza las cookies de sesión internas.
 * @property {() => Promise<boolean>} ensureSession
 *   Garantiza sesión activa (login implícito). Devuelve true si hay sesión.
 * @property {() => boolean} hasSession
 *   true si existe una sesión B1SESSION activa.
 * @property {() => number|null} sessionAgeSeconds
 *   Segundos desde el inicio de la sesión, o null si no hay sesión.
 * @property {(method: string, path: string, body?: object|null) => Promise<{status: number, body: object|null}>} authorizedRequest
 *   request con reintento automático ante 401 (re-login si aplica).
 * @property {() => Promise<number|null>} logout
 *   Cierra la sesión activa y limpia el estado. Devuelve el HTTP status, o null si no había sesión.
 */
export const ServiceLayerPort = {};
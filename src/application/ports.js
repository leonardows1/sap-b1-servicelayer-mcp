/**
 * Puertos de la capa de aplicación (DIP).
 *
 * La capa de aplicación depende de estas abstracciones, nunca de la
 * implementación HTTP concreta (ver src/infrastructure/http/serviceLayerClient.js).
 */

/**
 * Respuesta HTTP normalizada del ServiceLayer.
 * `body` es el JSON parseado (null si no es JSON); `text` el cuerpo crudo
 * (necesario para XML, ej: $metadata); `setCookies` las cabeceras Set-Cookie.
 *
 * @typedef {object} HttpResponse
 * @property {number} status Código HTTP
 * @property {object|null} body Cuerpo JSON parseado, o null
 * @property {string} text Cuerpo crudo (texto)
 * @property {string[]} setCookies Cabeceras Set-Cookie recibidas
 */

/**
 * Puerto del cliente ServiceLayer.
 *
 * @typedef {object} ServiceLayerPort
 * @property {(method: string, path: string, body?: object|null) => Promise<HttpResponse>} request
 *   HTTP crudo hacia el ServiceLayer. Actualiza las cookies de sesión internas.
 * @property {() => Promise<boolean>} ensureSession
 *   Garantiza sesión activa (login implícito). Devuelve true si hay sesión.
 * @property {() => boolean} hasSession
 *   true si existe una sesión B1SESSION activa.
 * @property {() => number|null} sessionAgeSeconds
 *   Segundos desde el inicio de la sesión, o null si no hay sesión.
 * @property {(method: string, path: string, body?: object|null) => Promise<HttpResponse>} authorizedRequest
 *   request con reintento automático ante 401 (re-login si aplica).
 * @property {() => Promise<number|null>} logout
 *   Cierra la sesión activa y limpia el estado. Devuelve el HTTP status, o null si no había sesión.
 */

export const ServiceLayerPort = {};
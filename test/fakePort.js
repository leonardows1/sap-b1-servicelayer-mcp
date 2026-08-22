/**
 * Fake del puerto ServiceLayerPort para tests.
 * Registra todas las llamadas y responde según un mapa `${method} ${path}`.
 *
 * @typedef {object} FakeCall
 * @property {string} method
 * @property {string} path
 * @property {object|null} body
 */

/**
 * @typedef {import("../src/application/ports.js").ServiceLayerPort} ServiceLayerPort
 * @typedef {import("../src/application/ports.js").HttpResponse} HttpResponse
 */

/**
 * Crea un fake completo del puerto ServiceLayerPort.
 *
 * @param {object} [options]
 * @param {Record<string, HttpResponse>} [options.responses] respuestas por `${method} ${path}`
 * @param {(method: string, path: string, body?: object|null) => Promise<HttpResponse>} [options.respond]
 *   alternativa a `responses`: función de respuesta personalizada
 * @returns {ServiceLayerPort & {calls: FakeCall[]}}
 */
export function createFakePort({ responses = {}, respond } = {}) {
  /** @type {FakeCall[]} */
  const calls = [];

  /**
   * @param {string} method
   * @param {string} path
   * @returns {HttpResponse}
   */
  const defaultRespond = (method, path) =>
    responses[`${method} ${path}`] ?? {
      status: 200,
      body: null,
      text: "",
      setCookies: [],
    };

  /** @type {ServiceLayerPort & {calls: FakeCall[]}} */
  const port = {
    calls,

    /** @param {string} method @param {string} path @param {object|null} [body] */
    async request(method, path, body = null) {
      calls.push({ method, path, body });
      return respond ? respond(method, path, body) : defaultRespond(method, path);
    },

    async ensureSession() {
      return true;
    },

    hasSession() {
      return true;
    },

    sessionAgeSeconds() {
      return 42;
    },

    /** @param {string} method @param {string} path @param {object|null} [body] */
    async authorizedRequest(method, path, body = null) {
      return port.request(method, path, body);
    },

    async logout() {
      return 200;
    },
  };

  return port;
}
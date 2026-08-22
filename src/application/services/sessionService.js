/**
 * Casos de uso: estado y cierre de la sesión contra el ServiceLayer.
 *
 * @typedef {object} SessionStatus
 * @property {boolean} connected
 * @property {string} [detail]
 * @property {number} [http]
 * @property {number|null} [session_age_sec]
 *
 * @typedef {object} LogoutResult
 * @property {boolean} logged_out
 * @property {string} [detail]
 * @property {number} [http]
 *
 * @typedef {object} SessionService
 * @property {() => Promise<SessionStatus>} status
 * @property {() => Promise<LogoutResult>} logout
 */

/**
 * @param {import("../ports.js").ServiceLayerPort} client
 * @returns {SessionService}
 */
export function createSessionService(client) {
  return {
    /**
     * Estado de la sesión activa. Consulta `GET /` como latido de verificación.
     * @returns {Promise<SessionStatus>}
     */
    async status() {
      if (!client.hasSession()) {
        return { connected: false, detail: "Sin sesión activa" };
      }
      const res = await client.request("GET", "/");
      return {
        connected: true,
        http: res.status,
        session_age_sec: client.sessionAgeSeconds(),
      };
    },

    /**
     * Cierre explícito de la sesión.
     * @returns {Promise<LogoutResult>}
     */
    async logout() {
      const status = await client.logout();
      if (status === null) {
        return { logged_out: false, detail: "No había sesión activa" };
      }
      return { logged_out: true, http: status };
    },
  };
}
/**
 * Casos de uso: estado y cierre de la sesión contra el ServiceLayer.
 *
 * @param {import("../ports.js").ServiceLayerPort} client
 */
export function createSessionService(client) {
  return {
    /**
     * Estado de la sesión activa. Consulta `GET /` como latido de verificación.
     * @returns {Promise<{connected: boolean, detail?: string, http?: number, session_age_sec?: number}>}
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
     * @returns {Promise<{logged_out: boolean, detail?: string, http?: number}>}
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
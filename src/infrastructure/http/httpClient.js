import http from "node:http";
import https from "node:https";

/**
 * Cliente HTTP mínimo (http/https) para el ServiceLayer.
 * Independiente de la sesión: las cookies viajan por parámetro `cookie`.
 *
 * @param {object} options
 * @param {string} options.baseUrl base del ServiceLayer (ej: https://host:50000/b1s/v1)
 * @param {boolean} options.verifyTls false para certificados autofirmados
 * @param {number} [options.timeoutMs] timeout por request (default 30s)
 * @returns {(method: string, path: string, body?: object|null, cookie?: string|null) => Promise<{status: number, body: object|null, text: string, setCookies: string[]}>}
 */
export function createHttpClient({ baseUrl, verifyTls, timeoutMs = 30000 }) {
  const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 1,
    rejectUnauthorized: verifyTls,
  });

  return function request(method, path, body = null, cookie = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}${path}`);
      const transport = url.protocol === "http:" ? http : https;
      const payload = body ? JSON.stringify(body) : null;

      const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      };

      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "http:" ? 80 : 443),
          path: `${url.pathname}${url.search}`,
          method,
          headers,
          agent: url.protocol === "https:" ? agent : undefined,
          rejectUnauthorized: verifyTls,
          timeout: timeoutMs,
        },
        (res) => {
          let raw = "";
          res.on("data", (chunk) => (raw += chunk));
          res.on("end", () => {
            let parsed = null;
            try {
              parsed = raw ? JSON.parse(raw) : null;
            } catch {
              parsed = null;
            }
            resolve({
              status: res.statusCode,
              body: parsed,
              text: raw,
              setCookies: res.headers["set-cookie"] || [],
            });
          });
        }
      );

      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  };
}
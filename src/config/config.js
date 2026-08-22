import { ConfigurationError } from "../domain/errors.js";

/**
 * Configuración del servidor, leída de variables de entorno.
 * Fuente única de verdad: el resto del sistema recibe este objeto inmutable.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Readonly<{
 *   baseUrl: string,
 *   database: string,
 *   username: string,
 *   password: string,
 *   verifyTls: boolean,
 *   readonly: boolean,
 *   maxTop: number,
 *   timeoutMs: number,
 * }>}
 */
export function loadConfig(env = process.env) {
  const baseUrl = (env.SAP_B1_SERVER_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new ConfigurationError("SAP_B1_SERVER_URL no configurado");
  }

  return Object.freeze({
    baseUrl,
    database: env.SAP_B1_DATABASE || "",
    username: env.SAP_B1_USERNAME || "",
    password: env.SAP_B1_PASSWORD || "",
    verifyTls: parseBoolean(env.SAP_B1_VERIFY_TLS, true),
    readonly: parseBoolean(env.SAP_B1_READONLY, true),
    maxTop: parseIntSafe(env.SAP_B1_MAX_TOP, 200),
    timeoutMs: 30000,
  });
}

/**
 * Booleano de env: solo la cadena "false" (case-insensitive) es falsa;
 * cualquier otro valor no vacío es true. Ausente → default.
 */
function parseBoolean(value, defaultValue) {
  if (value === undefined || value === "") return defaultValue;
  return value.toLowerCase() !== "false";
}

/**
 * Entero positivo de env con fallback. Evita NaN en la configuración.
 */
function parseIntSafe(value, defaultValue) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}
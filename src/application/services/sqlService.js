import { InvalidArgumentError } from "../../domain/errors.js";
import { ensureOk } from "../helpers.js";

/**
 * Caso de uso: SQL de solo lectura contra el ServiceLayer (`POST /sql_query`).
 * Disponible en ServiceLayer v2 / feature packs modernos; en v1 antiguos el
 * servicio no existe y se devuelve un error claro.
 *
 * Garantía de solo lectura: solo se aceptan sentencias SELECT o WITH.
 *
 * @typedef {object} SqlService
 * @property {(sql: string) => Promise<unknown>} runSql
 *   Ejecuta una consulta y devuelve las filas (`value`) o el cuerpo de la respuesta.
 */

/**
 * Solo SELECT o WITH (CTE). Todo lo demás (INSERT/UPDATE/DELETE/EXEC/DDL)
 * se rechaza para preservar el modo solo-lectura por contrato.
 */
const SELECT_ONLY = /^\s*(select|with)\b/i;

/**
 * Palabras clave de mutación: rechazadas aunque la sentencia empiece con
 * SELECT/WITH (evita multi-sentencia tipo `SELECT ...; DROP TABLE ...`).
 */
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|exec|execute|grant|revoke|merge|declare)\b/i;

/**
 * @param {import("../ports.js").ServiceLayerPort} client
 * @returns {SqlService}
 */
export function createSqlService(client) {
  return {
    /**
     * @param {string} sql
     * @returns {Promise<unknown>} filas (value) o cuerpo de la respuesta
     */
    async runSql(sql) {
      if (typeof sql !== "string" || !SELECT_ONLY.test(sql) || FORBIDDEN.test(sql)) {
        throw new InvalidArgumentError(
          "sql debe ser una consulta de solo lectura (SELECT o WITH)"
        );
      }
      const res = await client.authorizedRequest("POST", "/sql_query", { sql });
      if (res.status !== 200) {
        const body = /** @type {{error?: {message?: {value?: string}}}|null} */ (res.body);
        const detail = String(body?.error?.message?.value ?? "");
        if (/Service Not Found/i.test(detail)) {
          throw new InvalidArgumentError(
            "SQL no soportado por este ServiceLayer (v1 antiguos). Disponible en ServiceLayer v2 o feature packs recientes."
          );
        }
        ensureOk(res);
      }
      const body = /** @type {{value?: unknown}|null} */ (res.body);
      return body?.value ?? res.body ?? { success: true };
    },
  };
}
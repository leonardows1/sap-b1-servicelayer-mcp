/**
 * Manipulación pura de cookies de sesión (B1SESSION + ROUTEID + otras).
 * Sin estado: funciones unit-testables.
 */

/**
 * Parsea el primer par nombre=valor de una cabecera Set-Cookie.
 *
 * @param {string} headerValue
 * @returns {{name: string, value: string}|null}
 */
export function parseSetCookie(headerValue) {
  const first = headerValue.split(";")[0].trim();
  const eq = first.indexOf("=");
  if (eq <= 0) return null;
  return { name: first.slice(0, eq), value: first.slice(eq + 1) };
}

/**
 * Fusiona las cookies recibidas en una cabecera Cookie única, reemplazando
 * nombres duplicados (soporta ServiceLayer multi-nodo: ROUTEID).
 *
 * @param {string|null} current cabecera Cookie actual
 * @param {string[]} setCookies cabeceras Set-Cookie de la respuesta
 * @returns {string}
 */
export function mergeCookies(current, setCookies) {
  let header = current || "";
  for (const sc of setCookies) {
    const parsed = parseSetCookie(sc);
    if (!parsed) continue;
    const parts = header ? header.split("; ") : [];
    header = [
      ...parts.filter((c) => !c.startsWith(`${parsed.name}=`)),
      `${parsed.name}=${parsed.value}`,
    ].join("; ");
  }
  return header;
}

/**
 * Devuelve el valor de una cookie por nombre, o null si no existe.
 *
 * @param {string|null} header cabecera Cookie
 * @param {string} name
 * @returns {string|null}
 */
export function findCookie(header, name) {
  if (!header) return null;
  const prefix = `${name}=`;
  const match = header.split("; ").find((c) => c.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}
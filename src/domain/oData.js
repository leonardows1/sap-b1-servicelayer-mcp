/**
 * Helpers puros para construir consultas OData del ServiceLayer.
 * Sin efectos colaterales: funciones unit-testables.
 */

/**
 * Limita `top` al rango [1, maxTop]. Devuelve null si no es numérico.
 *
 * @param {unknown} top
 * @param {number} maxTop
 * @returns {number|null}
 */
export function clampTop(top, maxTop) {
  const n = parseInt(String(top), 10);
  if (Number.isNaN(n)) return null;
  return Math.min(Math.max(n, 1), maxTop);
}

/**
 * Combina filtros OData con " and ". Descarta partes nulas/vacías.
 * Devuelve undefined si no queda ningún filtro.
 *
 * @param {...(string|null|undefined)} parts
 * @returns {string|undefined}
 */
export function composeFilter(...parts) {
  const valid = parts.filter(Boolean);
  return valid.length > 0 ? valid.join(" and ") : undefined;
}

/**
 * Escapa un literal de cadena OData: duplica comillas simples.
 * Previene romper el $filter o la URL cuando el valor contiene `'`.
 *
 * @param {string|number} value
 * @returns {string}
 */
export function escapeODataString(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Construye una igualdad OData: `field eq 'value'` con el valor escapado.
 *
 * @param {string} field
 * @param {string|number} value
 * @returns {string}
 */
export function eq(field, value) {
  return `${field} eq '${escapeODataString(value)}'`;
}

/**
 * Valida un nombre de entidad OData: `@` opcional (tabla de usuario), luego
 * letra inicial y letras/dígitos/_.
 * Previene inyección de rutas (ej: "BusinessPartners/..." o "Items('x')").
 *
 * @param {unknown} name
 * @returns {boolean}
 */
export function isValidEntityName(name) {
  return typeof name === "string" && /^@?[A-Za-z][A-Za-z0-9_]*$/.test(name);
}

/**
 * Construye el query string OData (incluye "?") a partir de opciones opcionales.
 * `top` se acota con `maxTop`; `skip` se serializa como entero.
 *
 * @param {object} options
 * @param {string} [options.select]
 * @param {string} [options.filter]
 * @param {unknown} [options.top]
 * @param {unknown} [options.skip]
 * @param {string} [options.orderby]
 * @param {string} [options.expand]
 * @param {number} options.maxTop
 * @returns {string}
 */
export function buildQueryString({ select, filter, top, skip, orderby, expand, maxTop }) {
  const params = {};
  if (select) params.$select = select;
  if (filter) params.$filter = filter;

  const topValue = clampTop(top, maxTop);
  if (topValue != null) params.$top = String(topValue);

  if (skip != null) params.$skip = String(parseInt(String(skip), 10));
  if (orderby) params.$orderby = orderby;
  if (expand) params.$expand = expand;

  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : "";
}
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
  const n = parseInt(top, 10);
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
 * Construye una igualdad OData: `field eq 'value'`.
 *
 * @param {string} field
 * @param {string|number} value
 * @returns {string}
 */
export function eq(field, value) {
  return `${field} eq '${value}'`;
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

  if (skip != null) params.$skip = String(parseInt(skip, 10));
  if (orderby) params.$orderby = orderby;
  if (expand) params.$expand = expand;

  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : "";
}
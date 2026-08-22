/**
 * Construcción de resultados MCP (capa de interfaz).
 */

/**
 * Resultado de éxito con texto plano.
 * @param {string} text
 */
export function ok(text) {
  return { content: [{ type: "text", text }] };
}

/**
 * Resultado de error: JSON con el mensaje + isError.
 * @param {unknown} e
 */
export function err(e) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: e.message }) }],
    isError: true,
  };
}

/**
 * Serializa datos a JSON legible (2 espacios).
 * @param {unknown} data
 * @returns {string}
 */
export function serialize(data) {
  return JSON.stringify(data, null, 2);
}

/**
 * Envuelve un caso de uso para convertirlo en handler MCP:
 * captura errores y responde ok/err. Mantiene los controladores delgados.
 *
 * @template T
 * @param {(args: T) => Promise<string>} fn caso de uso que devuelve texto
 * @returns {(args: T) => Promise<object>} handler MCP
 */
export function handle(fn) {
  return async (args) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      return err(e);
    }
  };
}
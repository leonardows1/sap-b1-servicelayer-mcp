/**
 * Excepciones tipadas del dominio.
 *
 * - `ConfigurationError`: configuración inválida al arrancar (fatal).
 * - `InvalidArgumentError`: argumento inválido desde un caso de uso.
 * - `ServiceLayerError`: respuesta HTTP de error del ServiceLayer.
 */

export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class InvalidArgumentError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidArgumentError";
  }
}

export class ServiceLayerError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ServiceLayerError";
    this.status = status;
  }

  /**
   * Construye un ServiceLayerError a partir de una respuesta HTTP.
   * El mensaje del ServiceLayer (OData) tiene prioridad sobre el código HTTP.
   *
   * @param {{ status: number, body: object|null }} res
   * @returns {ServiceLayerError}
   */
  static from(res) {
    const message = res.body?.error?.message?.value || `HTTP ${res.status}`;
    return new ServiceLayerError(res.status, message);
  }
}
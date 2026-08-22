import { findCookie, mergeCookies } from "./cookies.js";

/**
 * @typedef {import("../../application/ports.js").ServiceLayerPort} ServiceLayerPort
 * @typedef {import("../../application/ports.js").HttpResponse} HttpResponse
 * @typedef {import("./httpClient.js").HttpRequestFn} HttpRequestFn
 */

/**
 * Adaptador del puerto ServiceLayerPort (ver src/application/ports.js).
 *
 * Responsabilidades:
 * - Mantener el jar de cookies (B1SESSION + ROUTEID) en memoria.
 * - Login implícito ante `POST /Login` y re-login automático ante 401.
 * - Logout garantizado con limpieza del estado.
 *
 * @implements {ServiceLayerPort}
 */
export class ServiceLayerClient {
  /** @type {HttpRequestFn} */
  _http;
  /** @type {string} */
  _database;
  /** @type {string} */
  _username;
  /** @type {string} */
  _password;
  /** @type {string|null} */
  _cookieHeader;
  /** @type {string|null} */
  _b1session;
  /** @type {number|null} */
  _sessionStartedAt;

  /**
   * @param {HttpRequestFn} httpClient
   * @param {object} credentials
   * @param {string} credentials.database CompanyDB
   * @param {string} credentials.username
   * @param {string} credentials.password
   */
  constructor(httpClient, { database, username, password }) {
    this._http = httpClient;
    this._database = database;
    this._username = username;
    this._password = password;

    this._cookieHeader = null;
    this._b1session = null;
    this._sessionStartedAt = null;
  }

  /** @returns {boolean} true si existe una sesión B1SESSION activa */
  hasSession() {
    return this._b1session !== null;
  }

  /** @returns {number|null} segundos desde el inicio de la sesión, o null */
  sessionAgeSeconds() {
    return this._sessionStartedAt
      ? Math.round((Date.now() - this._sessionStartedAt) / 1000)
      : null;
  }

  /**
   * HTTP crudo hacia el ServiceLayer. Absorbe las cookies Set-Cookie de la
   * respuesta y actualiza el estado de sesión si llega una B1SESSION nueva.
   *
   * @param {string} method
   * @param {string} path
   * @param {object|null} [body]
   * @returns {Promise<HttpResponse>}
   */
  async request(method, path, body = null) {
    const res = await this._http(method, path, body, this._cookieHeader);

    this._cookieHeader = mergeCookies(this._cookieHeader, res.setCookies);
    const b1session = findCookie(this._cookieHeader, "B1SESSION");
    if (b1session) {
      this._b1session = b1session;
      this._sessionStartedAt = Date.now();
    }
    return res;
  }

  /**
   * Garantiza sesión activa: login implícito si no existe.
   * @returns {Promise<boolean>}
   */
  async ensureSession() {
    if (this.hasSession()) return true;
    const res = await this.request("POST", "/Login", {
      CompanyDB: this._database,
      UserName: this._username,
      Password: this._password,
    });
    return res.status === 200 && this.hasSession();
  }

  /**
   * request con reintento automático ante 401 (sesión expirada).
   *
   * @param {string} method
   * @param {string} path
   * @param {object|null} [body]
   * @returns {Promise<HttpResponse>}
   */
  async authorizedRequest(method, path, body = null) {
    let res = await this.request(method, path, body);
    if (res.status === 401 && (await this.ensureSession())) {
      res = await this.request(method, path, body);
    }
    return res;
  }

  /**
   * Cierra la sesión activa y limpia el estado (aunque el Logout falle).
   * @returns {Promise<number|null>} HTTP status del Logout, o null si no había sesión
   */
  async logout() {
    if (!this.hasSession()) return null;
    let status;
    try {
      status = (await this.authorizedRequest("POST", "/Logout")).status;
    } finally {
      this._cookieHeader = null;
      this._b1session = null;
      this._sessionStartedAt = null;
    }
    return status;
  }
}
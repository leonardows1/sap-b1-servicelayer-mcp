/**
 * Parseo puro del documento EDMX ($metadata) del ServiceLayer.
 * Sin dependencias: regex sobre XML generado por máquina (formato estable).
 * Tolerante a namespaces OData v3 (b1s/v1) y v4 (b1s/v2).
 */

const ATTR = /([A-Za-z]+)="([^"]*)"/g;

/**
 * Extrae pares atributo=valor de una etiqueta XML.
 * @param {string} tag contenido entre < y > de la etiqueta
 * @returns {Record<string, string>}
 */
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(ATTR)) out[m[1]] = m[2];
  return out;
}

/**
 * Lista los entity sets del documento: `<EntitySet Name="..." EntityType="..."/>`.
 * Ignora FunctionImport/ActionImport (no son datos CRUD).
 *
 * @param {string} edmx XML crudo de $metadata
 * @returns {Array<{name: string, entityType: string}>}
 */
export function parseEntitySets(edmx) {
  const sets = [];
  for (const m of edmx.matchAll(/<EntitySet\b[^>]*\/?>/g)) {
    const a = attrs(m[0]);
    if (a.Name) sets.push({ name: a.Name, entityType: a.EntityType || null });
  }
  return sets;
}

/**
 * Extrae el esquema de un tipo de entidad: propiedades, claves y OpenType.
 * Devuelve null si el tipo no existe en el documento.
 *
 * @param {string} edmx XML crudo de $metadata
 * @param {string} entityName nombre del entity type (ej: BusinessPartners)
 * @returns {{name: string, openType: boolean, properties: Array<{name: string, type: string, nullable: boolean, key: boolean}>}|null}
 */
export function extractEntitySchema(edmx, entityName) {
  const re = new RegExp(`<EntityType\\b[^>]*\\bName="${escapeRe(entityName)}"[^>]*>([\\s\\S]*?)<\\/EntityType>`, "g");
  const m = re.exec(edmx);
  if (!m) return null;

  const tag = m[0].slice(0, m[0].indexOf(">") + 1);
  const openType = attrs(tag).OpenType === "true";

  const keyRefs = [...m[1].matchAll(/<PropertyRef\b[^>]*\bName="([^"]*)"/g)].map((k) => k[1]);

  const properties = [];
  for (const p of m[1].matchAll(/<Property\b[^>]*\/?>/g)) {
    const a = attrs(p[0]);
    if (!a.Name) continue;
    properties.push({
      name: a.Name,
      type: a.Type || null,
      nullable: a.Nullable !== "false",
      key: keyRefs.includes(a.Name),
    });
  }

  return { name: entityName, openType, properties };
}

/**
 * Lista los function/action imports (métodos de servicio).
 * Soporta:
 * - v3: `<FunctionImport Name="X" ReturnType="Y"><Parameter Name="P" Mode="In" Type="T"/></FunctionImport>`
 * - v4: `<FunctionImport Name="X" Function="SAPB1.F"/>` / `<ActionImport Name="X" Action="SAPB1.A"/>`
 *       con `<Function Name="F">` / `<Action Name="A">` y sus `<Parameter>`.
 * Las acciones enlazadas (IsBound="true") se marcan kind="bound": solo listables.
 *
 * @param {string} edmx XML crudo de $metadata
 * @returns {Array<{name: string, kind: "function"|"action"|"bound", returnType: string|null, parameters: Array<{name: string, type: string|null, mode: string}>}>}
 */
export function parseFunctionImports(edmx) {
  const declarations = new Map();
  for (const m of edmx.matchAll(/<(Function|Action)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const a = attrs(m[0].slice(0, m[0].indexOf(">") + 1));
    const kind = m[1].toLowerCase();
    if (a.IsBound === "true") {
      declarations.set(`${kind}:${a.Name}`, { bound: true });
    } else {
      declarations.set(`${kind}:${a.Name}`, {
        kind,
        parameters: parseParameters(m[2]),
      });
    }
  }

  const imports = [];
  const importRe = /<(FunctionImport|ActionImport)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  for (const m of edmx.matchAll(importRe)) {
    const a = attrs(m[2]);
    const tagKind = m[1].toLowerCase();
    if (!a.Name) continue;

    const refKind = a.Function ? "function" : a.Action ? "action" : tagKind;
    const refName = (a.Function || a.Action || "").split(".").pop();
    const ref = refName ? declarations.get(`${refKind}:${refName}`) : null;

    if (ref?.bound) {
      imports.push({ name: a.Name, kind: "bound", returnType: null, parameters: [] });
      continue;
    }

    imports.push({
      name: a.Name,
      kind: refKind === "action" ? "action" : "function",
      returnType: a.ReturnType || null,
      parameters: ref?.parameters || parseParameters(m[3] || ""),
    });
  }
  return imports;
}

/**
 * Parsea `<Parameter Name="P" Mode="In" Type="T"/>` del contenido de una etiqueta.
 * @param {string} content
 * @returns {Array<{name: string, type: string|null, mode: string}>}
 */
function parseParameters(content) {
  const params = [];
  for (const p of content.matchAll(/<Parameter\b[^>]*\/?>/g)) {
    const a = attrs(p[0]);
    if (!a.Name) continue;
    params.push({ name: a.Name, type: a.Type || null, mode: a.Mode || "In" });
  }
  return params;
}

/**
 * Escapa caracteres regex para construir patrones de búsqueda literales.
 * @param {string} s
 */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * Parseo puro del documento EDMX ($metadata) del ServiceLayer.
 * Sin dependencias: regex sobre XML generado por máquina (formato estable).
 * Tolerante a namespaces OData v3 (b1s/v1) y v4 (b1s/v2).
 */

/**
 * @typedef {object} EntitySetInfo
 * @property {string} name
 * @property {string|null} entityType
 */

/**
 * @typedef {object} EntityProperty
 * @property {string} name
 * @property {string|null} type
 * @property {boolean} nullable
 * @property {boolean} key
 */

/**
 * @typedef {object} EntityNavigation
 * @property {string} name nombre de la navigation property (válido para $expand)
 * @property {string|null} targetType tipo de entidad destino (sin namespace)
 */

/**
 * @typedef {object} EntitySchema
 * @property {string} name
 * @property {boolean} openType
 * @property {EntityProperty[]} properties
 * @property {EntityNavigation[]} navigationProperties
 */

/**
 * @typedef {object} FunctionImportParameter
 * @property {string} name
 * @property {string|null} type
 * @property {string} mode
 */

/**
 * @typedef {object} FunctionImportInfo
 * @property {string} name
 * @property {"function"|"action"|"bound"} kind
 * @property {string|null} returnType
 * @property {FunctionImportParameter[]} parameters
 */

const ATTR = /([A-Za-z]+)="([^"]*)"/g;

/**
 * Extrae pares atributo=valor de una etiqueta XML.
 * @param {string} tag contenido entre < y > de la etiqueta
 * @returns {Record<string, string>}
 */
function attrs(tag) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of tag.matchAll(ATTR)) {
    const key = m[1];
    const value = m[2];
    if (key !== undefined && value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Lista los entity sets del documento: `<EntitySet Name="..." EntityType="..."/>`.
 * Ignora FunctionImport/ActionImport (no son datos CRUD).
 *
 * @param {string} edmx XML crudo de $metadata
 * @returns {EntitySetInfo[]}
 */
export function parseEntitySets(edmx) {
  /** @type {EntitySetInfo[]} */
  const sets = [];
  for (const m of edmx.matchAll(/<EntitySet\b[^>]*\/?>/g)) {
    const a = attrs(m[0] ?? "");
    if (a.Name) sets.push({ name: a.Name, entityType: a.EntityType || null });
  }
  return sets;
}

/**
 * Mapa de roles de Association → tipo de entidad.
 * `<Association Name="FK_X"><End Role="R" Type="SAPB1.T"/></Association>`
 *
 * @param {string} edmx
 * @returns {Map<string, string>} clave `${AssociationName}:${Role}` → tipo corto
 */
function associationRoleTypes(edmx) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const m of edmx.matchAll(/<Association\b([^>]*)>([\s\S]*?)<\/Association>/g)) {
    const openTag = (m[0] ?? "").slice(0, (m[0] ?? "").indexOf(">") + 1);
    const a = attrs(openTag);
    if (!a.Name) continue;
    for (const end of (m[2] ?? "").matchAll(/<End\b[^>]*\/?>/g)) {
      const e = attrs(end[0] ?? "");
      if (!e.Role || !e.Type) continue;
      map.set(`${a.Name}:${e.Role}`, e.Type.split(".").pop() ?? e.Type);
    }
  }
  return map;
}

/**
 * Extrae el esquema de un tipo de entidad: propiedades, claves y OpenType.
 * Devuelve null si el tipo no existe en el documento.
 *
 * @param {string} edmx XML crudo de $metadata
 * @param {string} entityName nombre del entity type (ej: BusinessPartners)
 * @returns {EntitySchema|null}
 */
export function extractEntitySchema(edmx, entityName) {
  const re = new RegExp(`<EntityType\\b[^>]*\\bName="${escapeRe(entityName)}"[^>]*>([\\s\\S]*?)<\\/EntityType>`, "g");
  const m = re.exec(edmx);
  if (!m) return null;

  const full = m[0] ?? "";
  const body = m[1] ?? "";
  const openTag = full.slice(0, full.indexOf(">") + 1);
  const openType = attrs(openTag).OpenType === "true";

  const keyRefs = [...body.matchAll(/<PropertyRef\b[^>]*\bName="([^"]*)"/g)]
    .map((k) => k[1] ?? "");

  /** @type {EntityProperty[]} */
  const properties = [];
  for (const p of body.matchAll(/<Property\b[^>]*\/?>/g)) {
    const a = attrs(p[0] ?? "");
    if (!a.Name) continue;
    properties.push({
      name: a.Name,
      type: a.Type || null,
      nullable: a.Nullable !== "false",
      key: keyRefs.includes(a.Name),
    });
  }

  const roleTypes = associationRoleTypes(edmx);

  /** @type {EntityNavigation[]} */
  const navigationProperties = [];
  for (const np of body.matchAll(/<NavigationProperty\b[^>]*\/?>/g)) {
    const a = attrs(np[0] ?? "");
    if (!a.Name) continue;
    const targetType =
      a.Relationship && a.ToRole
        ? roleTypes.get(`${a.Relationship.split(".").pop()}:${a.ToRole}`) ?? null
        : null;
    navigationProperties.push({ name: a.Name, targetType });
  }

  return { name: entityName, openType, properties, navigationProperties };
}

/**
 * Extrae el esquema de una entidad por su nombre de entity set.
 * Resuelve el EntityType vía el mapeo del EntityContainer (varios entity sets
 * pueden compartir un mismo tipo, ej: Orders/Invoices → SAPB1.Document).
 * Devuelve null si la entidad no existe en el documento.
 *
 * @param {string} edmx XML crudo de $metadata
 * @param {string} entityName nombre del entity set (ej: Orders)
 * @returns {EntitySchema|null}
 */
export function resolveEntitySchema(edmx, entityName) {
  const set = parseEntitySets(edmx).find((s) => s.name === entityName);
  if (!set) return null;
  const typeName = (set.entityType ?? entityName).split(".").pop() ?? entityName;
  return extractEntitySchema(edmx, typeName);
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
 * @returns {FunctionImportInfo[]}
 */
export function parseFunctionImports(edmx) {
  /** @type {Map<string, {bound: true} | {kind: "function"|"action", parameters: FunctionImportParameter[]}>} */
  const declarations = new Map();
  for (const m of edmx.matchAll(/<(Function|Action)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const a = attrs((m[0] ?? "").slice(0, (m[0] ?? "").indexOf(">") + 1));
    const kind = (m[1] ?? "").toLowerCase();
    if (kind !== "function" && kind !== "action") continue;
    if (!a.Name) continue;
    if (a.IsBound === "true") {
      declarations.set(`${kind}:${a.Name}`, { bound: true });
    } else {
      declarations.set(`${kind}:${a.Name}`, {
        kind,
        parameters: parseParameters(m[2] ?? ""),
      });
    }
  }

  /** @type {FunctionImportInfo[]} */
  const imports = [];
  const importRe = /<(FunctionImport|ActionImport)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  for (const m of edmx.matchAll(importRe)) {
    const a = attrs(m[2] ?? "");
    const tagKind = (m[1] ?? "").toLowerCase();
    if (!a.Name) continue;

    // v3: IsBindable="true" marca imports enlazados a entity sets (no invocables standalone)
    if (a.IsBindable === "true") {
      imports.push({ name: a.Name, kind: "bound", returnType: null, parameters: [] });
      continue;
    }

    const refKind = a.Function ? "function" : a.Action ? "action" : tagKind;
    const refName = (a.Function || a.Action || "").split(".").pop() ?? "";
    const ref = refName ? declarations.get(`${refKind}:${refName}`) : null;

    if (ref && "bound" in ref) {
      imports.push({ name: a.Name, kind: "bound", returnType: null, parameters: [] });
      continue;
    }

    imports.push({
      name: a.Name,
      kind: refKind === "action" ? "action" : "function",
      returnType: a.ReturnType || null,
      parameters: (ref && "parameters" in ref ? ref.parameters : null) || parseParameters(m[3] ?? ""),
    });
  }
  return imports;
}

/**
 * Parsea `<Parameter Name="P" Mode="In" Type="T"/>` del contenido de una etiqueta.
 * @param {string} content
 * @returns {FunctionImportParameter[]}
 */
function parseParameters(content) {
  /** @type {FunctionImportParameter[]} */
  const params = [];
  for (const p of content.matchAll(/<Parameter\b[^>]*\/?>/g)) {
    const a = attrs(p[0] ?? "");
    if (!a.Name) continue;
    params.push({ name: a.Name, type: a.Type || null, mode: a.Mode || "In" });
  }
  return params;
}

/**
 * Escapa caracteres regex para construir patrones de búsqueda literales.
 * @param {string} s
 * @returns {string}
 */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
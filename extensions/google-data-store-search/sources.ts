import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { asRecord, stringField } from "./types.ts";
import type { DataStoreSource, Environment } from "./types.ts";

export function normalizeSource(value: unknown): DataStoreSource {
  const source = asRecord(value);
  const name = stringField(source, "name");
  const dataStoreId = stringField(source, "dataStoreId") || stringField(source, "data_store_id");
  if (!name || !dataStoreId) {
    throw new Error("Each source requires a non-empty name and dataStoreId.");
  }
  const rawAliases = source.aliases;
  if (rawAliases !== undefined && (!Array.isArray(rawAliases) ||
      rawAliases.some(alias => typeof alias !== "string" || !alias.trim()))) {
    throw new Error(`Invalid aliases for source: ${name}`);
  }
  const field = (camel: string, snake: string) => stringField(source, camel) || stringField(source, snake);
  return {
    name, dataStoreId,
    aliases: rawAliases?.map((alias: string) => alias.trim()),
    description: stringField(source, "description"),
    project: stringField(source, "project"),
    location: stringField(source, "location"),
    collection: stringField(source, "collection"),
    servingConfig: field("servingConfig", "serving_config"),
    engineId: field("engineId", "engine_id"),
    engineServingConfig: field("engineServingConfig", "engine_serving_config"),
    filter: stringField(source, "filter"),
    confluenceSpaceKey: field("confluenceSpaceKey", "confluence_space_key"),
    confluenceSpaceName: field("confluenceSpaceName", "confluence_space_name"),
    sharepointSiteId: field("sharepointSiteId", "sharepoint_site_id"),
    sharepointSiteName: field("sharepointSiteName", "sharepoint_site_name"),
  };
}

function terms(source: DataStoreSource): string[] {
  return [source.name, ...(source.aliases || [])].map(value => value.trim().toLowerCase());
}

export function validateSources(sources: DataStoreSource[]): DataStoreSource[] {
  if (!sources.length) throw new Error("No Google Data Store sources are configured.");
  const owners = new Map<string, number>();
  sources.forEach((source, index) => {
    for (const term of new Set(terms(source))) {
      if (owners.has(term) && owners.get(term) !== index) {
        throw new Error(`Ambiguous source name or alias: ${term}`);
      }
      owners.set(term, index);
    }
  });
  return sources;
}

export function parseSources(text: string): DataStoreSource[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("Source catalog contains invalid JSON."); }
  if (!Array.isArray(parsed)) throw new Error("Source catalog must contain a JSON array.");
  return validateSources(parsed.map(normalizeSource));
}

export async function loadConfiguredSources(options: {
  env?: Environment;
  home?: string;
  read?: (path: string) => Promise<string>;
} = {}): Promise<DataStoreSource[]> {
  const env = options.env ?? process.env;
  const read = options.read ?? (path => readFile(path, "utf8"));
  if (env.GOOGLE_DATA_STORE_SOURCES_FILE) {
    return parseSources(await read(env.GOOGLE_DATA_STORE_SOURCES_FILE));
  }
  const defaultPath = join(options.home ?? homedir(), ".config/pi/google-data-store-sources.json");
  try {
    return parseSources(await read(defaultPath));
  } catch (error) {
    // Only an absent optional file permits fallback. Invalid JSON, permissions,
    // or ambiguous sources must not silently redirect a search elsewhere.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (env.GOOGLE_DATA_STORE_SOURCES) return parseSources(env.GOOGLE_DATA_STORE_SOURCES);
  if (env.GOOGLE_DATA_STORE_ID) {
    return [normalizeSource({
      name: env.GOOGLE_DATA_STORE_SOURCE || "default",
      dataStoreId: env.GOOGLE_DATA_STORE_ID,
    })];
  }
  throw new Error("Configure ~/.config/pi/google-data-store-sources.json or GOOGLE_DATA_STORE_SOURCES_FILE, GOOGLE_DATA_STORE_SOURCES, or GOOGLE_DATA_STORE_ID.");
}

export function chooseSource(sources: DataStoreSource[], requested: string | undefined, query: string): DataStoreSource {
  validateSources(sources);
  const needle = requested?.trim().toLowerCase();
  if (needle) {
    const exact = sources.filter(source => terms(source).includes(needle));
    if (exact.length === 1) return exact[0];
    const partial = sources.filter(source => terms(source).some(term => term.includes(needle) || needle.includes(term)));
    if (partial.length === 1) return partial[0];
  } else {
    if (sources.length === 1) return sources[0];
    const matches = sources.filter(source => terms(source).some(term => query.toLowerCase().includes(term)));
    if (matches.length === 1) return matches[0];
  }
  throw new Error(`Source is unknown or ambiguous. Choose one of: ${sources.map(source => source.name).join(", ")}`);
}

export function buildSourceFilter(source: DataStoreSource): string | undefined {
  const quote = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const clauses: string[] = [];
  const fields = [
    ["space.key", source.confluenceSpaceKey],
    ["space.name", source.confluenceSpaceName],
    ["parentReference.siteId", source.sharepointSiteId],
    ["SiteName", source.sharepointSiteName],
  ];
  for (const [field, value] of fields) {
    if (value) clauses.push(`${field}: ANY("${quote(value)}")`);
  }
  if (source.filter) clauses.push(`(${source.filter})`);
  return clauses.length ? clauses.join(" AND ") : undefined;
}

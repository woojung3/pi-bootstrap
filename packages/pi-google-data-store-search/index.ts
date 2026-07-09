import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { GoogleAuth } from "google-auth-library";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface DataStoreSource {
  name: string;
  dataStoreId: string;
  aliases?: string[];
  description?: string;
  project?: string;
  location?: string;
  collection?: string;
  servingConfig?: string;
  filter?: string;
  confluenceSpaceKey?: string;
  confluenceSpaceName?: string;
  sharepointSiteId?: string;
  sharepointSiteName?: string;
}

type SearchParams = {
  query: string;
  source?: string;
  pageSize?: number;
  filter?: string;
};

type NormalizedResult = {
  title?: string;
  uri?: string;
  snippet?: string;
  documentName?: string;
  id?: string;
  source: string;
};

type SearchResultDetails = {
  query: string;
  source: DataStoreSource;
  servingConfig: string;
  results: NormalizedResult[];
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function envOrDefault(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayField(obj: Record<string, unknown>, key: string): string[] | undefined {
  const value = obj[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : undefined;
}

function normalizeSource(value: unknown): DataStoreSource {
  const source = asRecord(value);
  const name = stringField(source, "name");
  const dataStoreId = stringField(source, "dataStoreId") || stringField(source, "data_store_id");

  if (!name || !dataStoreId) {
    throw new Error("Each Google Data Store source must include non-empty name and dataStoreId fields.");
  }

  return {
    name,
    dataStoreId,
    aliases: stringArrayField(source, "aliases"),
    description: stringField(source, "description"),
    project: stringField(source, "project"),
    location: stringField(source, "location"),
    collection: stringField(source, "collection"),
    servingConfig: stringField(source, "servingConfig") || stringField(source, "serving_config"),
    filter: stringField(source, "filter"),
    confluenceSpaceKey: stringField(source, "confluenceSpaceKey") || stringField(source, "confluence_space_key"),
    confluenceSpaceName: stringField(source, "confluenceSpaceName") || stringField(source, "confluence_space_name"),
    sharepointSiteId: stringField(source, "sharepointSiteId") || stringField(source, "sharepoint_site_id"),
    sharepointSiteName: stringField(source, "sharepointSiteName") || stringField(source, "sharepoint_site_name"),
  };
}

async function loadConfiguredSources(): Promise<DataStoreSource[]> {
  const sourcesFile = process.env.GOOGLE_DATA_STORE_SOURCES_FILE;
  const sourcesJson = process.env.GOOGLE_DATA_STORE_SOURCES;
  const defaultSourcesFile = join(homedir(), ".config", "pi", "google-data-store-sources.json");

  for (const candidate of [sourcesFile, defaultSourcesFile]) {
    if (!candidate) continue;
    try {
      const content = await readFile(candidate, "utf-8");
      const parsed = JSON.parse(content) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error(`${candidate} must contain a JSON array.`);
      }
      return parsed.map(normalizeSource);
    } catch (error) {
      if (candidate === sourcesFile) {
        throw error;
      }
    }
  }

  if (sourcesJson) {
    const parsed = JSON.parse(sourcesJson) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("GOOGLE_DATA_STORE_SOURCES must be a JSON array.");
    }
    return parsed.map(normalizeSource);
  }

  const legacyDataStoreId = process.env.GOOGLE_DATA_STORE_ID;
  if (legacyDataStoreId) {
    return [
      {
        name: envOrDefault("GOOGLE_DATA_STORE_SOURCE", "default"),
        aliases: ["default"],
        dataStoreId: legacyDataStoreId,
        description: "Legacy single data store configured by GOOGLE_DATA_STORE_ID.",
      },
    ];
  }

  throw new Error(
    "Missing Google Data Store source configuration. Create ~/.config/pi/google-data-store-sources.json, or set GOOGLE_DATA_STORE_SOURCES_FILE, GOOGLE_DATA_STORE_SOURCES, or GOOGLE_DATA_STORE_ID.",
  );
}

function sourceTerms(source: DataStoreSource): string[] {
  return [source.name, ...(source.aliases || [])].map((term) => term.toLowerCase());
}

function listSources(sources: DataStoreSource[]): string {
  return sources
    .map((source) => {
      const aliases = source.aliases?.length ? ` aliases: ${source.aliases.join(", ")}` : "";
      const description = source.description ? ` — ${source.description}` : "";
      return `- ${source.name}${aliases}${description}`;
    })
    .join("\n");
}

function chooseSource(sources: DataStoreSource[], requestedSource: string | undefined, query: string): DataStoreSource {
  if (sources.length === 0) {
    throw new Error("No Google Data Store sources are configured.");
  }

  if (requestedSource?.trim()) {
    const needle = requestedSource.trim().toLowerCase();
    const exact = sources.find((source) => sourceTerms(source).includes(needle));
    if (exact) return exact;

    const partialMatches = sources.filter((source) => sourceTerms(source).some((term) => term.includes(needle) || needle.includes(term)));
    if (partialMatches.length === 1) return partialMatches[0];

    throw new Error(`Unknown Google Data Store source: ${requestedSource}\nAvailable sources:\n${listSources(sources)}`);
  }

  if (sources.length === 1) return sources[0];

  const normalizedQuery = query.toLowerCase();
  const queryMatches = sources.filter((source) => sourceTerms(source).some((term) => normalizedQuery.includes(term)));
  if (queryMatches.length === 1) return queryMatches[0];

  throw new Error(
    `Google Data Store source is ambiguous. Set the source parameter to one of the configured sources.\nAvailable sources:\n${listSources(sources)}`,
  );
}

function buildServingConfig(source: DataStoreSource): string {
  const project = source.project || requiredEnv("GOOGLE_CLOUD_PROJECT");
  const location = source.location || envOrDefault("GOOGLE_CLOUD_LOCATION", "global");
  const collection = source.collection || envOrDefault("GOOGLE_DATA_STORE_COLLECTION", "default_collection");
  const servingConfig = source.servingConfig || envOrDefault("GOOGLE_DATA_STORE_SERVING_CONFIG", "default_config");

  return `projects/${project}/locations/${location}/collections/${collection}/dataStores/${source.dataStoreId}/servingConfigs/${servingConfig}`;
}

function quoteFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function anyFilter(field: string, value: string): string {
  return `${field}: ANY("${quoteFilterValue(value)}")`;
}

function buildSourceFilter(source: DataStoreSource): string | undefined {
  const clauses: string[] = [];

  if (source.confluenceSpaceKey) {
    clauses.push(anyFilter("space.key", source.confluenceSpaceKey));
  }
  if (source.confluenceSpaceName) {
    clauses.push(anyFilter("space.name", source.confluenceSpaceName));
  }
  if (source.sharepointSiteId) {
    clauses.push(anyFilter("parentReference.siteId", source.sharepointSiteId));
  }
  if (source.sharepointSiteName) {
    clauses.push(anyFilter("SiteName", source.sharepointSiteName));
  }
  if (source.filter) {
    clauses.push(`(${source.filter})`);
  }

  return clauses.length > 0 ? clauses.join(" AND ") : undefined;
}

function extractSnippet(derived: Record<string, unknown>): string | undefined {
  const snippets = derived.snippets;
  if (Array.isArray(snippets) && snippets.length > 0) {
    const first = asRecord(snippets[0]);
    return stringField(first, "snippet") || stringField(first, "htmlSnippet");
  }

  const extractiveAnswers = derived.extractive_answers || derived.extractiveAnswers;
  if (Array.isArray(extractiveAnswers) && extractiveAnswers.length > 0) {
    const first = asRecord(extractiveAnswers[0]);
    return stringField(first, "content");
  }

  const extractiveSegments = derived.extractive_segments || derived.extractiveSegments;
  if (Array.isArray(extractiveSegments) && extractiveSegments.length > 0) {
    const first = asRecord(extractiveSegments[0]);
    return stringField(first, "content");
  }

  return undefined;
}

function normalizeResult(result: unknown, sourceName: string): NormalizedResult {
  const r = asRecord(result);
  const document = asRecord(r.document);
  const structData = asRecord(document.structData);
  const derivedStructData = asRecord(document.derivedStructData);

  const title =
    stringField(derivedStructData, "title") ||
    stringField(structData, "title") ||
    stringField(document, "id");

  const uri =
    stringField(derivedStructData, "url") ||
    stringField(derivedStructData, "uri") ||
    stringField(structData, "url") ||
    stringField(structData, "uri") ||
    stringField(structData, "link") ||
    stringField(derivedStructData, "link");

  const snippet =
    extractSnippet(derivedStructData) ||
    stringField(derivedStructData, "snippet") ||
    stringField(structData, "snippet") ||
    stringField(structData, "description");

  return {
    title,
    uri,
    snippet,
    documentName: stringField(document, "name"),
    id: stringField(document, "id"),
    source: sourceName,
  };
}

function formatResults(results: NormalizedResult[], source: DataStoreSource): string {
  if (results.length === 0) {
    return `No Google Data Store search results found in source: ${source.name}.`;
  }

  return results
    .map((result, index) => {
      const lines = [`${index + 1}. ${result.title || result.id || "Untitled document"}`, `Source: ${result.source}`];

      if (result.uri) {
        lines.push(`URL: ${result.uri}`);
      }

      if (result.snippet) {
        lines.push(`Snippet: ${result.snippet}`);
      }

      if (result.documentName) {
        lines.push(`Document: ${result.documentName}`);
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

export default function googleDataStoreSearchExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "google_data_store_search",
    label: "Google Data Store Search",
    description:
      "Search one configured Google Gemini Enterprise / Vertex AI Search Data Store source, such as Confluence or SharePoint.",
    promptSnippet: "Search a configured Google Data Store source such as Confluence or SharePoint.",
    promptGuidelines: [
      "Use google_data_store_search when the user asks about information that may live in a configured Gemini Enterprise / Agent Search Data Store.",
      "When the user names a source such as Confluence or SharePoint, pass that source name in google_data_store_search.source.",
      "When google_data_store_search returns sources, cite the returned title or URL in the answer.",
    ],
    parameters: Type.Object({
      query: Type.String({
        description: "Natural language search query to run against the selected Google Data Store source.",
      }),
      source: Type.Optional(
        Type.String({
          description:
            "Configured source name or alias to search, for example 'confluence', 'confluence-pages', 'sharepoint', or 'sharepoint-files'. If omitted, the tool uses query hints only when they identify exactly one source.",
        }),
      ),
      pageSize: Type.Optional(
        Type.Number({
          description: "Maximum number of search results to return. Defaults to GOOGLE_DATA_STORE_PAGE_SIZE or 5.",
          minimum: 1,
          maximum: 20,
        }),
      ),
      filter: Type.Optional(
        Type.String({
          description: "Optional Discovery Engine filter expression. Overrides any source-level or global filter.",
        }),
      ),
    }),

    async execute(_toolCallId, params: SearchParams, signal): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: SearchResultDetails;
    }> {
      const sources = await loadConfiguredSources();
      const selectedSource = chooseSource(sources, params.source, params.query);
      const servingConfig = buildServingConfig(selectedSource);
      const pageSize = Math.min(
        Math.max(
          params.pageSize ?? Number.parseInt(process.env.GOOGLE_DATA_STORE_PAGE_SIZE || "5", 10),
          1,
        ),
        20,
      );

      const auth = new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
      const token = await auth.getAccessToken();

      if (!token) {
        throw new Error("Failed to get Google Cloud access token. The token was null or empty.");
      }

      const project = selectedSource.project || requiredEnv("GOOGLE_CLOUD_PROJECT");
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-goog-user-project": project,
      };

      const url = `https://discoveryengine.googleapis.com/v1/${servingConfig}:search`;

      const body: Record<string, unknown> = {
        query: params.query,
        pageSize,
        queryExpansionSpec: { condition: "AUTO" },
        spellCorrectionSpec: { mode: "AUTO" },
        contentSearchSpec: {
          snippetSpec: { returnSnippet: true },
        },
      };

      const filter = params.filter || buildSourceFilter(selectedSource) || process.env.GOOGLE_DATA_STORE_FILTER;
      if (filter) {
        body.filter = filter;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Google Data Store search failed for source '${selectedSource.name}': HTTP ${response.status} ${text}`);
      }

      const payload = (await response.json()) as { results?: unknown[] };
      const results = (payload.results || []).map((result) => normalizeResult(result, selectedSource.name));
      const text = formatResults(results, selectedSource);

      return {
        content: [{ type: "text", text }],
        details: {
          query: params.query,
          source: selectedSource,
          servingConfig,
          results,
        },
      };
    },
  });
}

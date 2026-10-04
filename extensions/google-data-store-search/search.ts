import { GoogleAuth } from "google-auth-library";
import { buildSourceFilter } from "./sources.ts";
import { mergeResults, normalizeResult } from "./results.ts";
import type { DataStoreSource, Environment, SearchParams } from "./types.ts";

function projectFor(source: DataStoreSource, env: Environment): string {
  const project = source.project || env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error("Missing required environment variable: GOOGLE_CLOUD_PROJECT");
  return project;
}

export function buildSearchEndpoint(source: DataStoreSource, env: Environment = process.env) {
  const project = projectFor(source, env);
  const location = source.location || env.GOOGLE_CLOUD_LOCATION || "global";
  const collection = source.collection || env.GOOGLE_DATA_STORE_COLLECTION || "default_collection";
  const parent = `projects/${project}/locations/${location}/collections/${collection}`;
  const dataStore = `${parent}/dataStores/${source.dataStoreId}`;
  const engineId = source.engineId || env.GOOGLE_DISCOVERY_ENGINE_ID;
  const servingConfig = engineId
    ? source.engineServingConfig || env.GOOGLE_DISCOVERY_ENGINE_SERVING_CONFIG || "default_search"
    : source.servingConfig || env.GOOGLE_DATA_STORE_SERVING_CONFIG || "default_config";
  const resource = engineId ? `${parent}/engines/${engineId}` : dataStore;
  return {
    url: `https://discoveryengine.googleapis.com/v1/${resource}/servingConfigs/${servingConfig}:search`,
    dataStore,
    project,
    useDataStoreSpecs: Boolean(engineId),
  };
}

export function resolvePageSize(requested: number | undefined, configured?: string): number {
  const value = requested ?? (configured === undefined ? 5 : Number(configured));
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    throw new Error("Search page size must be an integer.");
  }
  return Math.min(20, Math.max(1, value));
}

export async function searchSource(options: {
  source: DataStoreSource;
  params: SearchParams;
  signal?: AbortSignal;
  env?: Environment;
  fetcher?: typeof fetch;
  getToken?: () => Promise<string | null | undefined>;
}) {
  const { source, params, signal } = options;
  const env = options.env ?? process.env;
  signal?.throwIfAborted();
  if (!params.query.trim()) throw new Error("Search query must not be empty.");
  const endpoint = buildSearchEndpoint(source, env);
  const pageSize = resolvePageSize(params.pageSize, env.GOOGLE_DATA_STORE_PAGE_SIZE);
  const getToken = options.getToken ?? (() => new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  }).getAccessToken());
  const token = await getToken();
  signal?.throwIfAborted();
  if (!token) throw new Error("Google Cloud access token is unavailable.");

  // Filters are search controls, not authorization boundaries. An explicit
  // tool filter retains the documented override semantics.
  const filter = params.filter || buildSourceFilter(source) || env.GOOGLE_DATA_STORE_FILTER;
  const body: Record<string, unknown> = {
    query: params.query,
    pageSize,
    queryExpansionSpec: { condition: "AUTO" },
    spellCorrectionSpec: { mode: "AUTO" },
    contentSearchSpec: {
      snippetSpec: { returnSnippet: true },
      extractiveContentSpec: {
        maxExtractiveSegmentCount: 3,
        maxExtractiveAnswerCount: 3,
        returnExtractiveSegmentScore: true,
      },
    },
  };
  if (endpoint.useDataStoreSpecs) body.dataStoreSpecs = [{ dataStore: endpoint.dataStore }];
  if (filter) body.filter = filter;

  // Exactly one request per invocation. Do not infer person names or inject
  // organization-specific keywords into the user's query.
  const response = await (options.fetcher ?? fetch)(endpoint.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-goog-user-project": endpoint.project },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Google Data Store search failed for '${source.name}': HTTP ${response.status}`);
  }
  const payload = await response.json() as { results?: unknown[] };
  if (payload.results !== undefined && !Array.isArray(payload.results)) {
    throw new Error("Google Data Store returned an invalid result list.");
  }
  const results = mergeResults((payload.results || []).map(result => normalizeResult(result, source.name))).slice(0, pageSize);
  return { results, searchEndpoint: endpoint.url };
}

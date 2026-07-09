import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { GoogleAuth } from "google-auth-library";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  engineId?: string;
  engineServingConfig?: string;
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

type ExtractedSegment = {
  content: string;
  relevanceScore?: number;
};

type NormalizedResult = {
  title?: string;
  uri?: string;
  segments: ExtractedSegment[];
  snippet?: string;
  documentName?: string;
  id?: string;
  source: string;
};

type SearchResultDetails = {
  query: string;
  source: DataStoreSource;
  searchEndpoint: string;
  results: NormalizedResult[];
  synthesized?: SynthesizedSearchResult;
};

type SynthesizedSearchResult = {
  answer: string;
  documents: Array<{
    title?: string;
    url?: string;
    source?: string;
    summary: string;
  }>;
  limitations?: string[];
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
    engineId: stringField(source, "engineId") || stringField(source, "engine_id"),
    engineServingConfig: stringField(source, "engineServingConfig") || stringField(source, "engine_serving_config"),
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

    const partialMatches = sources.filter((source) =>
      sourceTerms(source).some((term) => term.includes(needle) || needle.includes(term)),
    );
    if (partialMatches.length === 1) return partialMatches[0];

    throw new Error(`Unknown Google Data Store source: ${requestedSource}\nAvailable sources:\n${listSources(sources)}`);
  }

  if (sources.length === 1) return sources[0];

  const normalizedQuery = query.toLowerCase();
  const queryMatches = sources.filter((source) =>
    sourceTerms(source).some((term) => normalizedQuery.includes(term)),
  );
  if (queryMatches.length === 1) return queryMatches[0];

  throw new Error(
    `Google Data Store source is ambiguous. Set the source parameter to one of the configured sources.\nAvailable sources:\n${listSources(sources)}`,
  );
}

/**
 * Build the search endpoint URL.
 *
 * Priority:
 * 1. GOOGLE_DISCOVERY_ENGINE_ID env var → engine/servingConfig endpoint
 *    (Enterprise edition: supports extractive segments, LLM add-on, etc.)
 * 2. Fallback → dataStore/servingConfig endpoint
 *    (Standard edition: snippet-only)
 *
 * When using the engine endpoint, the dataStore to search is narrowed via
 * the `dataStoreSpecs` request field so per-source selection still works.
 */
function buildSearchEndpoint(source: DataStoreSource): { url: string; useDataStoreSpecs: boolean } {
  const project = source.project || requiredEnv("GOOGLE_CLOUD_PROJECT");
  const location = source.location || envOrDefault("GOOGLE_CLOUD_LOCATION", "global");
  const collection = source.collection || envOrDefault("GOOGLE_DATA_STORE_COLLECTION", "default_collection");
  const engineId = source.engineId || process.env.GOOGLE_DISCOVERY_ENGINE_ID;

  if (engineId) {
    const engineServingConfig = source.engineServingConfig || envOrDefault("GOOGLE_DISCOVERY_ENGINE_SERVING_CONFIG", "default_search");
    const url = `https://discoveryengine.googleapis.com/v1/projects/${project}/locations/${location}/collections/${collection}/engines/${engineId}/servingConfigs/${engineServingConfig}:search`;
    return { url, useDataStoreSpecs: true };
  }

  // Fallback: dataStore direct search (standard edition, snippet only)
  const dataStoreServingConfig = source.servingConfig || envOrDefault("GOOGLE_DATA_STORE_SERVING_CONFIG", "default_config");
  const url = `https://discoveryengine.googleapis.com/v1/projects/${project}/locations/${location}/collections/${collection}/dataStores/${source.dataStoreId}/servingConfigs/${dataStoreServingConfig}:search`;
  return { url, useDataStoreSpecs: false };
}

function buildDataStoreResourceName(source: DataStoreSource): string {
  const project = source.project || requiredEnv("GOOGLE_CLOUD_PROJECT");
  const location = source.location || envOrDefault("GOOGLE_CLOUD_LOCATION", "global");
  const collection = source.collection || envOrDefault("GOOGLE_DATA_STORE_COLLECTION", "default_collection");
  return `projects/${project}/locations/${location}/collections/${collection}/dataStores/${source.dataStoreId}`;
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

function extractSegments(derived: Record<string, unknown>): ExtractedSegment[] {
  const segments: ExtractedSegment[] = [];

  // extractive_segments: full paragraph/table chunks (enterprise edition)
  const rawSegments = derived.extractive_segments || derived.extractiveSegments;
  if (Array.isArray(rawSegments) && rawSegments.length > 0) {
    for (const seg of rawSegments) {
      const s = asRecord(seg);
      const content = stringField(s, "content");
      if (content) {
        const score = typeof s.relevanceScore === "number" ? s.relevanceScore : undefined;
        segments.push({ content, relevanceScore: score });
      }
    }
    if (segments.length > 0) return segments;
  }

  // extractive_answers: shorter answer-style excerpts (enterprise edition)
  const rawAnswers = derived.extractive_answers || derived.extractiveAnswers;
  if (Array.isArray(rawAnswers) && rawAnswers.length > 0) {
    for (const ans of rawAnswers) {
      const a = asRecord(ans);
      const content = stringField(a, "content");
      if (content) segments.push({ content });
    }
    if (segments.length > 0) return segments;
  }

  return segments;
}

function extractFallbackSnippet(derived: Record<string, unknown>): string | undefined {
  const snippets = derived.snippets;
  if (Array.isArray(snippets) && snippets.length > 0) {
    const first = asRecord(snippets[0]);
    return stringField(first, "snippet") || stringField(first, "htmlSnippet");
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

  const segments = extractSegments(derivedStructData);
  const snippet = segments.length === 0 ? extractFallbackSnippet(derivedStructData) : undefined;

  return {
    title,
    uri,
    segments,
    snippet,
    documentName: stringField(document, "name"),
    id: stringField(document, "id"),
    source: sourceName,
  };
}

function formatRawResults(results: NormalizedResult[], source: DataStoreSource): string {
  if (results.length === 0) {
    return `No Google Data Store search results found in source: ${source.name}.`;
  }

  return results
    .map((result, index) => {
      const lines: string[] = [`${index + 1}. ${result.title || result.id || "Untitled document"}`];
      lines.push(`Source: ${result.source}`);

      if (result.uri) {
        lines.push(`URL: ${result.uri}`);
      }

      if (result.segments.length > 0) {
        lines.push("Content:");
        for (const seg of result.segments) {
          lines.push(seg.content);
          lines.push("---");
        }
      } else if (result.snippet) {
        lines.push(`Snippet: ${result.snippet}`);
      }

      if (result.documentName) {
        lines.push(`Document: ${result.documentName}`);
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

function formatSynthesizedResult(result: SynthesizedSearchResult): string {
  const lines = ["Answer:", result.answer.trim(), "", "Documents searched:"];
  for (const [index, doc] of result.documents.entries()) {
    lines.push(`${index + 1}. ${doc.title || "Untitled document"}`);
    if (doc.source) lines.push(`Source: ${doc.source}`);
    if (doc.url) lines.push(`URL: ${doc.url}`);
    lines.push(`Summary: ${doc.summary}`);
  }
  if (result.limitations?.length) {
    lines.push("", "Limitations:");
    for (const limitation of result.limitations) lines.push(`- ${limitation}`);
  }
  return lines.join("\n");
}

function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) return fenced[1].trim();
  const startObj = text.indexOf("{");
  const startArr = text.indexOf("[");
  const start = startObj < 0 ? startArr : startArr < 0 ? startObj : Math.min(startObj, startArr);
  if (start < 0) throw new Error(`Subagent response did not contain JSON: ${text.slice(0, 300)}`);
  const trimmed = text.trim();
  const end = trimmed.endsWith("]") ? text.lastIndexOf("]") : text.lastIndexOf("}");
  if (end < start) throw new Error(`Subagent response JSON range was invalid: ${text.slice(0, 300)}`);
  return text.slice(start, end + 1).trim();
}

function parsePiJson(stdout: string): string {
  let text = "";
  for (const line of stdout.split("\n").filter(Boolean)) {
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === "message_update" && ev.assistantMessageEvent?.type === "text_delta") text += ev.assistantMessageEvent.delta;
    if (ev.type === "message_end" && ev.message?.role === "assistant") {
      for (const p of ev.message.content ?? []) {
        if (p.type === "text" && !text.includes(p.text)) text += p.text;
      }
    }
  }
  return text.trim();
}

async function runPiSubagent(opts: {
  cwd: string;
  provider: string;
  model: string;
  prompt: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), "pi-gds-subagent-"));
  const promptPath = join(tmpDir, "prompt.md");
  await writeFile(promptPath, opts.prompt, { encoding: "utf-8", mode: 0o600 });
  try {
    return await new Promise<string>((resolve, reject) => {
      const args = [
        "--mode", "json",
        "--print",
        "--no-session",
        "--no-context-files",
        "--no-tools",
        "--provider", opts.provider,
        "--model", opts.model,
        `@${promptPath}`,
      ];
      // On Windows, npm installs `pi` as `pi.cmd`/`pi.ps1`. `spawn("pi", ...,
      // { shell: false })` can fail with ENOENT even when `pi --version` works
      // in PowerShell, because CreateProcess does not run npm command shims the
      // same way an interactive shell does. Use the cmd shim through a shell.
      const piCommand = process.platform === "win32" ? "pi.cmd" : "pi";
      const proc = spawn(piCommand, args, {
        cwd: opts.cwd,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Google Data Store subagent timed out after ${opts.timeoutMs ?? 180000}ms`));
      }, opts.timeoutMs ?? 180000);
      const abort = () => {
        proc.kill("SIGTERM");
        reject(new Error("Google Data Store subagent was aborted."));
      };
      opts.signal?.addEventListener("abort", abort, { once: true });
      proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      proc.on("error", (err) => {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", abort);
        reject(err);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", abort);
        if (code !== 0) reject(new Error(`Google Data Store subagent failed with status ${code}: ${stderr}\n${stdout}`));
        else resolve(parsePiJson(stdout));
      });
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function buildSynthesisPrompt(query: string, source: DataStoreSource, rawResults: string): string {
  return `당신은 기업 문서 검색 결과를 정제하는 전문 subagent입니다.

목표:
- 사용자의 질문에 대해 검색 결과에 근거한 정제된 답변을 작성합니다.
- 검색 결과에 없는 내용은 추측하지 않습니다.
- 같은 질문으로 호출자가 반복 검색하지 않도록, 찾아본 문서별 요약도 함께 제공합니다.
- 문서 제목과 URL을 반드시 보존합니다.
- 출력은 JSON 객체 하나만 반환합니다.

출력 JSON schema:
{
  "answer": "질문에 대한 정제된 한국어 답변. 근거가 있는 사항만 포함.",
  "documents": [
    { "title": "문서 제목", "url": "문서 URL", "source": "검색 source", "summary": "이 문서에서 확인한 핵심 내용 요약" }
  ],
  "limitations": ["확인하지 못한 점이나 주의사항"]
}

사용자 질문:
${query}

검색 source:
${source.name}

검색 원자료:
${rawResults}`;
}

function extractLikelyKoreanPersonName(query: string): string | undefined {
  const match = /([가-힣]{2,4})\s*(?:사원|님의|의|님|씨)/.exec(query) || /([가-힣]{2,4})/.exec(query);
  return match?.[1];
}

function buildQueryVariants(query: string): string[] {
  const variants = [query];
  const personName = extractLikelyKoreanPersonName(query);
  const looksLikeRoleQuery = /RnR|R&R|역할|업무|담당|책임|분장/i.test(query);
  if (personName && looksLikeRoleQuery) {
    variants.push(`${personName} 구성원 역할 개인별 업무분장 담당자 역할 책임`);
    variants.push(`${personName} 구성원 역할 개인별 업무분장 RnR 보안 V2X 담당자`);
  }
  return [...new Set(variants)];
}

function mergeNormalizedResults(results: NormalizedResult[]): NormalizedResult[] {
  const byKey = new Map<string, NormalizedResult>();
  for (const result of results) {
    const key = result.uri || result.documentName || result.id || `${result.title}:${result.source}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...result, segments: [...result.segments] });
      continue;
    }
    for (const segment of result.segments) {
      if (!existing.segments.some((s) => s.content === segment.content)) existing.segments.push(segment);
    }
    if (!existing.snippet && result.snippet) existing.snippet = result.snippet;
  }
  return [...byKey.values()];
}

async function synthesizeResults(opts: {
  query: string;
  source: DataStoreSource;
  rawResults: string;
  cwd: string;
  model?: { provider: string; id: string };
  signal?: AbortSignal;
}): Promise<SynthesizedSearchResult | undefined> {
  if (process.env.GOOGLE_DATA_STORE_SUBAGENT === "0" || process.env.GOOGLE_DATA_STORE_SUBAGENT === "false") {
    return undefined;
  }

  const provider = process.env.GOOGLE_DATA_STORE_SUBAGENT_PROVIDER || opts.model?.provider;
  const model = process.env.GOOGLE_DATA_STORE_SUBAGENT_MODEL || opts.model?.id;
  if (!provider || !model) return undefined;

  const prompt = buildSynthesisPrompt(opts.query, opts.source, opts.rawResults);
  const text = await runPiSubagent({ cwd: opts.cwd, provider, model, prompt, signal: opts.signal });
  const parsed = JSON.parse(extractJson(text)) as Partial<SynthesizedSearchResult>;
  if (!parsed.answer || !Array.isArray(parsed.documents)) {
    throw new Error(`Google Data Store subagent returned invalid JSON: ${text.slice(0, 500)}`);
  }
  return {
    answer: parsed.answer,
    documents: parsed.documents.map((doc) => ({
      title: doc.title,
      url: doc.url,
      source: doc.source,
      summary: doc.summary || "요약 없음",
    })),
    limitations: Array.isArray(parsed.limitations) ? parsed.limitations : undefined,
  };
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

    async execute(_toolCallId, params: SearchParams, signal, _onUpdate, ctx): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: SearchResultDetails;
    }> {
      const sources = await loadConfiguredSources();
      const selectedSource = chooseSource(sources, params.source, params.query);
      const { url, useDataStoreSpecs } = buildSearchEndpoint(selectedSource);

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

      const filter = params.filter || buildSourceFilter(selectedSource) || process.env.GOOGLE_DATA_STORE_FILTER;
      const queryVariants = buildQueryVariants(params.query);
      const allResults: NormalizedResult[] = [];

      for (const query of queryVariants) {
        const body: Record<string, unknown> = {
          query,
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

        // When using engine endpoint, narrow to specific dataStore via dataStoreSpecs
        if (useDataStoreSpecs) {
          body.dataStoreSpecs = [
            { dataStore: buildDataStoreResourceName(selectedSource) },
          ];
        }

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
          throw new Error(
            `Google Data Store search failed for source '${selectedSource.name}': HTTP ${response.status} ${text}`,
          );
        }

        const payload = (await response.json()) as { results?: unknown[] };
        allResults.push(...(payload.results || []).map((result) => normalizeResult(result, selectedSource.name)));
      }

      const results = mergeNormalizedResults(allResults);
      const rawText = formatRawResults(results, selectedSource);

      let synthesized: SynthesizedSearchResult | undefined;
      try {
        synthesized = await synthesizeResults({
          query: params.query,
          source: selectedSource,
          rawResults: rawText,
          cwd: ctx?.cwd || process.cwd(),
          model: ctx?.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined,
          signal,
        });
      } catch (error) {
        // Do not fail search if the optional subagent fails. Return raw evidence instead.
        synthesized = {
          answer: `Subagent synthesis failed, so raw search evidence is returned. Error: ${error instanceof Error ? error.message : String(error)}`,
          documents: results.map((result) => ({
            title: result.title,
            url: result.uri,
            source: result.source,
            summary: result.segments[0]?.content || result.snippet || "No summary available.",
          })),
          limitations: ["Subagent synthesis failed; the caller should inspect the returned document summaries carefully."],
        };
      }

      const text = synthesized ? formatSynthesizedResult(synthesized) : rawText;

      return {
        content: [{ type: "text", text }],
        details: {
          query: params.query,
          source: selectedSource,
          searchEndpoint: url,
          results,
          synthesized,
        },
      };
    },
  });
}

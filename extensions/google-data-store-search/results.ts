import { asRecord, stringField } from "./types.ts";
import type { DataStoreSource, ExtractedSegment, NormalizedResult, SynthesizedSearchResult } from "./types.ts";

function extractSegments(derived: Record<string, unknown>): ExtractedSegment[] {
  for (const key of ["extractive_segments", "extractiveSegments", "extractive_answers", "extractiveAnswers"]) {
    const items = derived[key];
    if (!Array.isArray(items)) continue;
    const segments = items.flatMap(item => {
      const record = asRecord(item);
      const content = stringField(record, "content");
      return content ? [{ content, relevanceScore: typeof record.relevanceScore === "number" ? record.relevanceScore : undefined }] : [];
    });
    if (segments.length) return segments;
  }
  return [];
}

export function normalizeResult(value: unknown, source: string): NormalizedResult {
  const result = asRecord(value);
  const document = asRecord(result.document);
  const data = asRecord(document.structData);
  const derived = asRecord(document.derivedStructData);
  const segments = extractSegments(derived);
  const snippets = Array.isArray(derived.snippets) ? derived.snippets : [];
  const firstSnippet = asRecord(snippets[0]);
  return {
    title: stringField(derived, "title") || stringField(data, "title") || stringField(document, "id"),
    uri: stringField(derived, "url") || stringField(derived, "uri") || stringField(data, "url") ||
      stringField(data, "uri") || stringField(data, "link") || stringField(derived, "link"),
    segments,
    snippet: segments.length ? undefined : stringField(firstSnippet, "snippet") || stringField(firstSnippet, "htmlSnippet"),
    documentName: stringField(document, "name"),
    id: stringField(document, "id"),
    source,
  };
}

export function mergeResults(results: NormalizedResult[]): NormalizedResult[] {
  const merged = new Map<string, NormalizedResult>();
  for (const result of results) {
    const key = result.uri || result.documentName || result.id || `${result.title}:${result.source}`;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...result, segments: [...result.segments] });
      continue;
    }
    for (const segment of result.segments) {
      if (!previous.segments.some(item => item.content === segment.content)) previous.segments.push(segment);
    }
    previous.snippet ||= result.snippet;
  }
  return [...merged.values()];
}

export function formatRawResults(results: NormalizedResult[], source: DataStoreSource): string {
  if (!results.length) return `No Google Data Store search results found in source: ${source.name}.`;
  return results.map((result, index) => {
    const lines = [`${index + 1}. ${result.title || result.id || "Untitled document"}`, `Source: ${result.source}`];
    if (result.uri) lines.push(`URL: ${result.uri}`);
    if (result.segments.length) {
      lines.push("Content:");
      for (const segment of result.segments) lines.push(segment.content, "---");
    } else if (result.snippet) lines.push(`Snippet: ${result.snippet}`);
    if (result.documentName) lines.push(`Document: ${result.documentName}`);
    return lines.join("\n");
  }).join("\n\n");
}

export function formatSynthesizedResult(result: SynthesizedSearchResult): string {
  const lines = ["Answer:", result.answer, "", "Documents searched:"];
  result.documents.forEach((document, index) => {
    lines.push(`${index + 1}. ${document.title || "Untitled document"}`);
    if (document.source) lines.push(`Source: ${document.source}`);
    if (document.url) lines.push(`URL: ${document.url}`);
    lines.push(`Summary: ${document.summary}`);
  });
  if (result.limitations?.length) lines.push("", "Limitations:", ...result.limitations.map(value => `- ${value}`));
  return lines.join("\n");
}

export async function renderSearchResults(
  results: NormalizedResult[],
  source: DataStoreSource,
  summarize: (raw: string) => Promise<SynthesizedSearchResult | undefined>,
  signal?: AbortSignal,
): Promise<{ text: string; synthesized?: SynthesizedSearchResult }> {
  const raw = formatRawResults(results, source);
  if (!results.length) return { text: raw };
  try {
    signal?.throwIfAborted();
    const synthesized = await summarize(raw);
    signal?.throwIfAborted();
    return { text: synthesized ? formatSynthesizedResult(synthesized) : raw, synthesized };
  } catch (error) {
    if (signal?.aborted) throw error;
    // Preserve every excerpt on failure, not only the first segment. Never
    // expose model stderr or partial output through the error message.
    return { text: `Summary unavailable; raw search evidence follows.\n\n${raw}` };
  }
}

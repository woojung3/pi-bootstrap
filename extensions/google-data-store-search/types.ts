export type Environment = Record<string, string | undefined>;

export interface DataStoreSource {
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

export interface SearchParams {
  query: string;
  source?: string;
  pageSize?: number;
  filter?: string;
}

export interface ExtractedSegment {
  content: string;
  relevanceScore?: number;
}

export interface NormalizedResult {
  title?: string;
  uri?: string;
  segments: ExtractedSegment[];
  snippet?: string;
  documentName?: string;
  id?: string;
  source: string;
}

export interface SynthesizedSearchResult {
  answer: string;
  documents: Array<{ title?: string; url?: string; source?: string; summary: string }>;
  limitations?: string[];
}

export interface SearchResultDetails {
  query: string;
  source: DataStoreSource;
  searchEndpoint: string;
  results: NormalizedResult[];
  synthesized?: SynthesizedSearchResult;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { chooseSource, loadConfiguredSources } from "./sources.ts";
import { searchSource } from "./search.ts";
import { renderSearchResults } from "./results.ts";
import { synthesizeResults } from "./synthesis.ts";
import type { SearchParams, SearchResultDetails } from "./types.ts";

export default function googleDataStoreSearchExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "google_data_store_search",
    label: "Google Data Store Search",
    description: "Search one configured Google Gemini Enterprise / Vertex AI Search Data Store source, such as Confluence or SharePoint.",
    promptSnippet: "Search configured enterprise documents in Confluence or SharePoint.",
    promptGuidelines: [
      "Use google_data_store_search when the user asks about information that may live in a configured Google Data Store.",
      "When the user names a source such as Confluence or SharePoint, pass that source name in google_data_store_search.source.",
      "Cite the returned document title or URL in the answer.",
    ],
    parameters: Type.Object({
      query: Type.String({ minLength: 1, description: "Natural language search query." }),
      source: Type.Optional(Type.String({ description: "Configured source name or alias; required when the source is ambiguous." })),
      pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "Maximum results; defaults to GOOGLE_DATA_STORE_PAGE_SIZE or 5." })),
      filter: Type.Optional(Type.String({ description: "Discovery Engine filter; overrides source-level or global search filters." })),
    }),
    async execute(_toolCallId, params: SearchParams, signal, _onUpdate, ctx): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: SearchResultDetails;
    }> {
      const source = chooseSource(await loadConfiguredSources(), params.source, params.query);
      const { results, searchEndpoint } = await searchSource({ source, params, signal });
      const rendered = await renderSearchResults(results, source, rawResults => synthesizeResults({
        query: params.query, source, rawResults, signal,
        model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined,
      }), signal);
      return {
        content: [{ type: "text", text: rendered.text }],
        details: { query: params.query, source, searchEndpoint, results, synthesized: rendered.synthesized },
      };
    },
  });
}

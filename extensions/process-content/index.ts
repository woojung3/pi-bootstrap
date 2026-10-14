import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ContentError, createProcessor, MODELS, PROVIDER } from "./core.ts";

export default function (pi: ExtensionAPI) {
  const process = createProcessor();
  pi.registerTool({
    name: "process_content",
    label: "Process content",
    description: "Process supplied text/JSON-as-text with an isolated tool-free model: summarize, extract, classify, compare or reformat. Call inside codemode after fetching/filtering so raw results need not enter the main model context. Only for user-authorized data processing; content is sent to openai-codex. No autonomous lookup, writes or fallback provider. Return only the needed result, not the input. Check ok before using output. Sources must come from actual retrieval. Input over 120 KB is rejected, not silently truncated.",
    exposure: "codemode",
    parameters: Type.Object({
      content: Type.String({ minLength: 1, maxLength: 120000, description: "Text or JSON.stringify(data), not a filename or URL to fetch." }),
      instruction: Type.String({ minLength: 1, maxLength: 4000 }),
      sources: Type.Optional(Type.Array(Type.Object({
        id: Type.String({ minLength: 1, maxLength: 200 }),
        title: Type.Optional(Type.String({ maxLength: 500 })),
        url: Type.Optional(Type.String({ maxLength: 2000 })),
      }), { maxItems: 100 })),
      model: Type.Optional(Type.Union(MODELS.map(id => Type.Literal(id)))),
      thinking: Type.Optional(Type.Union(["low", "medium", "high"].map(v => Type.Literal(v)))),
      maxOutputTokens: Type.Optional(Type.Integer({ minimum: 256, maximum: 8192 })),
      timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 180000 })),
    }, { additionalProperties: false }),
    outputSchema: Type.Object({
      ok: Type.Boolean(),
      provider: Type.String(), model: Type.Optional(Type.String()),
      result: Type.Optional(Type.String()),
      sources: Type.Optional(Type.Array(Type.Object({
        id: Type.String(), title: Type.Optional(Type.String()), url: Type.Optional(Type.String()),
      }))),
      warnings: Type.Optional(Type.Array(Type.String())), error: Type.Optional(Type.String()),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async execute(_id, params, signal, _onUpdate, ctx) {
      let outcome;
      try { outcome = await process(params, ctx.modelRegistry, signal); }
      catch (e) {
        outcome = { data: { ok: false, error: e instanceof ContentError ? e.code : "processing_failed", provider: PROVIDER }, usage: undefined };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(outcome.data) }],
        structuredContent: outcome.data,
        details: undefined,
        isError: !outcome.data.ok,
        usage: outcome.usage,
      };
    },
  });
}

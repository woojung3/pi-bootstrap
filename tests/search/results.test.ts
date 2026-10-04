import test from "node:test";
import assert from "node:assert/strict";
import { mergeResults, normalizeResult, renderSearchResults } from "../../extensions/google-data-store-search/results.ts";

const source = { name: "wiki", dataStoreId: "store" };
const result = { source: "wiki", title: "Example", uri: "https://example.test/doc", segments: [{ content: "first paragraph" }, { content: "second paragraph" }] };

test("extract paragraphs before snippets", () => {
  const normalized = normalizeResult({ document: { derivedStructData: {
    extractive_segments: [{ content: "paragraph" }], snippets: [{ snippet: "snippet" }],
  } } }, "wiki");
  assert.equal(normalized.segments[0].content, "paragraph");
  assert.equal(normalized.snippet, undefined);
});

test("merge duplicate documents without duplicate segments", () => {
  const merged = mergeResults([result, result, { ...result, segments: [{ content: "third" }] }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].segments.length, 3);
  assert.equal(result.segments.length, 2);
});

test("summary failure returns every paragraph and URL", async () => {
  const rendered = await renderSearchResults([result], source, async () => { throw new Error("private diagnostic"); });
  assert.match(rendered.text, /first paragraph/);
  assert.match(rendered.text, /second paragraph/);
  assert.match(rendered.text, /https:\/\/example.test\/doc/);
  assert.doesNotMatch(rendered.text, /private diagnostic/);
});

test("disabled summary returns raw evidence", async () => {
  const rendered = await renderSearchResults([result], source, async () => undefined);
  assert.match(rendered.text, /second paragraph/);
  assert.equal(rendered.synthesized, undefined);
});

test("empty search does not call a model", async () => {
  await renderSearchResults([], source, async () => { assert.fail("No summary call"); });
});

test("cancellation is not converted into success", async () => {
  await assert.rejects(renderSearchResults([result], source, async () => undefined, AbortSignal.abort()), { name: "AbortError" });
});

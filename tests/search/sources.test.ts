import test from "node:test";
import assert from "node:assert/strict";
import { buildSourceFilter, chooseSource, loadConfiguredSources, parseSources } from "../../extensions/google-data-store-search/sources.ts";

const catalog = JSON.stringify([{ name: "wiki", dataStoreId: "wiki-store", aliases: ["confluence"] }]);
const missing = async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); };

test("normalize names, aliases and snake-case settings", () => {
  const [source] = parseSources('[{"name":" wiki ","data_store_id":"docs","aliases":[" alias "],"engine_id":"engine"}]');
  assert.equal(source.name, "wiki");
  assert.deepEqual(source.aliases, ["alias"]);
  assert.equal(source.engineId, "engine");
});

test("reject duplicate names and aliases case-insensitively", () => {
  for (const items of [
    [{ name: "a", dataStoreId: "a" }, { name: "A", dataStoreId: "b" }],
    [{ name: "a", dataStoreId: "a", aliases: ["same"] }, { name: "b", dataStoreId: "b", aliases: ["SAME"] }],
    [{ name: "a", dataStoreId: "a", aliases: ["b"] }, { name: "b", dataStoreId: "b" }],
  ]) assert.throws(() => parseSources(JSON.stringify(items)), /Ambiguous/);
});

test("reject malformed catalogs", () => {
  for (const value of ["{bad", "{}", "[]", '[{"name":"a"}]', '[{"name":"a","dataStoreId":"a","aliases":[42]}]']) {
    assert.throws(() => parseSources(value));
  }
});

test("invalid default file fails instead of using fallback", async () => {
  await assert.rejects(loadConfiguredSources({ env: { GOOGLE_DATA_STORE_SOURCES: catalog }, read: async () => "{bad" }), /invalid JSON/);
});

test("permission errors are not hidden", async () => {
  await assert.rejects(loadConfiguredSources({ env: { GOOGLE_DATA_STORE_SOURCES: catalog }, read: async () => {
    throw Object.assign(new Error("denied"), { code: "EACCES" });
  } }), /denied/);
});

test("only a missing default permits environment fallback", async () => {
  assert.equal((await loadConfiguredSources({ env: { GOOGLE_DATA_STORE_SOURCES: catalog }, read: missing }))[0].name, "wiki");
});

test("missing explicitly configured file does not fall back", async () => {
  await assert.rejects(loadConfiguredSources({ env: { GOOGLE_DATA_STORE_SOURCES_FILE: "/explicit", GOOGLE_DATA_STORE_SOURCES: catalog }, read: missing }), /missing/);
});

test("default catalog precedes inline environment catalog", async () => {
  const sources = await loadConfiguredSources({ env: { GOOGLE_DATA_STORE_SOURCES: "invalid" }, read: async () => catalog });
  assert.equal(sources[0].name, "wiki");
});

test("single-store environment works without a file", async () => {
  const [source] = await loadConfiguredSources({ env: { GOOGLE_DATA_STORE_ID: "docs" }, read: missing });
  assert.equal(source.dataStoreId, "docs");
});

test("choose one source and reject ambiguous queries", () => {
  const sources = parseSources('[{"name":"wiki","dataStoreId":"a","aliases":["confluence"]},{"name":"files","dataStoreId":"b","aliases":["sharepoint"]}]');
  assert.equal(chooseSource(sources, "Confluence", "anything").name, "wiki");
  assert.equal(chooseSource(sources, undefined, "sharepoint 문서").name, "files");
  assert.throws(() => chooseSource(sources, undefined, "confluence sharepoint"), /ambiguous/);
  assert.throws(() => chooseSource(sources, "unknown", "query"), /unknown/);
});

test("filter clauses combine and escape quotes", () => {
  const filter = buildSourceFilter({ name: "wiki", dataStoreId: "a", confluenceSpaceKey: 'A"B', filter: "custom = true" });
  assert.equal(filter, 'space.key: ANY("A\\"B") AND (custom = true)');
});

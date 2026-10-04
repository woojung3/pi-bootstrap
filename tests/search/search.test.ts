import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchEndpoint, resolvePageSize, searchSource } from "../../extensions/google-data-store-search/search.ts";

const source = { name: "wiki", dataStoreId: "store", project: "example" };

test("per-source engine overrides global and keeps store selector", () => {
  const endpoint = buildSearchEndpoint({ ...source, engineId: "source-engine" }, { GOOGLE_DISCOVERY_ENGINE_ID: "global-engine" });
  assert.match(endpoint.url, /engines\/source-engine\/servingConfigs\/default_search:search$/);
  assert.match(endpoint.dataStore, /dataStores\/store$/);
  assert.equal(endpoint.useDataStoreSpecs, true);
});

test("no engine uses direct datastore endpoint", () => {
  const endpoint = buildSearchEndpoint(source, {});
  assert.match(endpoint.url, /dataStores\/store\/servingConfigs\/default_config:search$/);
  assert.equal(endpoint.useDataStoreSpecs, false);
});

test("validate and bound page sizes", () => {
  assert.equal(resolvePageSize(undefined), 5);
  assert.equal(resolvePageSize(undefined, "12"), 12);
  assert.equal(resolvePageSize(100), 20);
  assert.equal(resolvePageSize(0), 1);
  for (const invalid of [NaN, Infinity, 1.5]) assert.throws(() => resolvePageSize(invalid));
  assert.throws(() => resolvePageSize(undefined, "invalid"));
});

test("send exactly the original query once without domain heuristics", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.query, "업무 담당");
    assert.equal(body.pageSize, 5);
    assert.equal(body.dataStoreSpecs.length, 1);
    return Response.json({ results: [] });
  };
  const result = await searchSource({ source: { ...source, engineId: "engine" }, params: { query: "업무 담당" },
    env: {}, fetcher, getToken: async () => "fake-test-token" });
  assert.equal(calls, 1);
  assert.deepEqual(result.results, []);
});

test("explicit tool filter retains documented override behavior", async () => {
  await searchSource({ source: { ...source, filter: "source filter" }, params: { query: "q", filter: "tool filter" }, env: {},
    getToken: async () => "fake", fetcher: async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).filter, "tool filter");
      return Response.json({});
    } });
});

test("validate query before acquiring credentials", async () => {
  await assert.rejects(searchSource({ source, params: { query: " " }, env: {}, getToken: async () => {
    assert.fail("Credentials must not be requested");
  } }), /empty/);
});

test("HTTP failures omit response bodies", async () => {
  await assert.rejects(searchSource({ source, params: { query: "q" }, env: {}, getToken: async () => "fake",
    fetcher: async () => new Response("private diagnostic", { status: 403 }) }), error => {
      assert.match(String(error), /HTTP 403/);
      assert.doesNotMatch(String(error), /private diagnostic/);
      return true;
    });
});

test("abort prevents credential and network calls", async () => {
  await assert.rejects(searchSource({ source, params: { query: "q" }, signal: AbortSignal.abort(), env: {},
    getToken: async () => { assert.fail("No credential call"); } }), { name: "AbortError" });
});

test("merged results respect maximum page size", async () => {
  const results = ["a", "b", "c"].map(id => ({ document: { id, derivedStructData: { title: id } } }));
  const result = await searchSource({ source, params: { query: "q", pageSize: 2 }, env: {}, getToken: async () => "fake",
    fetcher: async () => Response.json({ results }) });
  assert.equal(result.results.length, 2);
});

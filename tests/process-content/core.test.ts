import assert from "node:assert/strict";
import { test } from "node:test";
import { createProcessor, prepare, parseResponse, SYSTEM } from "../../extensions/process-content/core.ts";
const input = { content: "Synthetic: alpha is healthy", instruction: "Extract status" };
const usage = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
function message(extra = {}) { return { provider: "openai-codex", model: "gpt-6.1-sol", stopReason: "stop", usage, content: [{type:"text",text:JSON.stringify({result:"healthy",sourceIds:[],warnings:[]})}], ...extra }; }
function registry(reply = message()) {
  const calls: any[] = [];
  return { calls, find: (provider: string, id: string) => ({ provider, id, contextWindow: 200000 }),
    hasConfiguredAuth: () => true,
    streamSimple: (...args: any[]) => { calls.push(args); return { result: async () => reply }; } };
}
test("defaults and exact allowlist", () => {
  assert.equal(prepare(input).model, "gpt-6.1-sol");
  assert.equal(prepare(input).thinking, "low");
  for (const model of ["gpt-6-astra","gpt-6.1-sol","gpt-6-luna"]) assert.equal(prepare({...input,model}).model,model);
  for (const model of ["other", "openai-codex/gpt-6.1-sol", "gemini"]) assert.throws(() => prepare({...input,model}), /model_not_allowed/);
});
test("input limits reject without truncation", () => {
  assert.throws(() => prepare({...input,content:"한".repeat(41000)}), /input_too_large/);
  for (const n of [0, 8193, 1.5]) assert.throws(() => prepare({...input,maxOutputTokens:n}), /invalid_limits/);
  assert.throws(() => prepare({...input,timeoutMs:180001}), /invalid_limits/);
  assert.throws(() => prepare({...input,instruction:""}), /invalid_input/);
});
test("source validation and no invented citations", () => {
  for (const url of ["https://", "https://user:password@example.test", "https://exa mple.test", "javascript:alert(1)"])
    assert.throws(() => prepare({...input,sources:[{id:"x",url}]}), /invalid_sources/);
  assert.throws(() => prepare({...input,sources:[{id:"x"},{id:"x"}]}), /duplicate_source_ids/);
  assert.throws(() => parseResponse('{"result":"ok","sourceIds":["invented"],"warnings":[]}', [{id:"x"}]), /invalid_model_output/);
  assert.deepEqual(parseResponse('{"result":"ok","sourceIds":["x"],"warnings":[]}', [{id:"x",url:"https://example.test"}]).sources, [{id:"x",url:"https://example.test"}]);
});
test("isolated context, no tools, usage and no retries", async () => {
  const r = registry();
  const result = await createProcessor()(input, r);
  assert.equal(result.data.ok,true);
  assert.equal(result.usage,usage);
  const [model,context,options] = r.calls[0];
  assert.equal(model.provider,"openai-codex");
  assert.equal(context.messages.length,1);
  assert.equal(context.tools,undefined);
  assert.equal(context.systemPrompt,SYSTEM);
  assert.equal(options.maxRetries,0);
  assert.equal(options.cacheRetention,"none");
  assert.deepEqual(JSON.parse(context.messages[0].content[0].text).untrustedContent,input.content);
});
test("model and auth rejection before call", async () => {
  for (const patch of [{find:()=>undefined}, {find:()=>({provider:'openai-codex',id:'gpt-6.1-sol',api:'pi-virtual'})}, {hasConfiguredAuth:()=>false}, {find:()=>({provider:'openai-codex',id:'gpt-6.1-sol',contextWindow:100})}]) {
    const r = Object.assign(registry(),patch);
    await assert.rejects(createProcessor()(input,r));
    assert.equal(r.calls.length,0);
  }
});
test("errors redact provider bodies, preserve usage, never retry", async () => {
  for (const reply of [message({stopReason:"error",errorMessage:"TOKEN_CANARY"}), message({stopReason:"length"}), message({model:"other"}), message({content:[{type:"toolCall",name:"bash"}]}), message({content:[{type:"text",text:"not JSON"}]})]) {
    const r = registry(reply);
    const result = await createProcessor()(input,r);
    assert.equal(result.data.ok,false);
    assert.equal(result.usage,usage);
    assert.equal(r.calls.length,1);
    assert.ok(!JSON.stringify(result).includes("TOKEN_CANARY"));
  }
});
test("aborted before model call", async () => {
  const r = registry(), abort = new AbortController(); abort.abort();
  await assert.rejects(createProcessor()(input,r,abort.signal), /aborted/);
  assert.equal(r.calls.length,0);
});
test("concurrency cap and cancellation even if provider ignores abort", async () => {
  const run = createProcessor();
  const resolves: ((v:any)=>void)[] = [];
  const r = Object.assign(registry(), {streamSimple:()=>({result:()=>new Promise(resolve=>resolves.push(resolve))})});
  const a = new AbortController(), b = new AbortController();
  const first = run(input,r,a.signal), second = run(input,r,b.signal);
  await assert.rejects(run(input,r), /busy/);
  a.abort(); b.abort();
  assert.equal((await first).data.error,"aborted");
  assert.equal((await second).data.error,"aborted");
  await assert.rejects(run(input,r), /busy/);
  resolves.forEach(resolve=>resolve(message()));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await run(input,registry())).data.ok,true);
});
test("hard deadline and provider exception are safe", async () => {
  const r = Object.assign(registry(), {streamSimple:()=>({result:()=>new Promise(()=>{})})});
  assert.equal((await createProcessor()({...input,timeoutMs:1000},r)).data.error,"timeout");
  const broken = Object.assign(registry(), {streamSimple:()=>{throw new Error('TOKEN_CANARY')}});
  assert.equal((await createProcessor()(input,broken)).data.error,"model_failed");
});

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { parsePiJson, parseSynthesis, runPiSubagent, subagentArgs, synthesizeResults } from "../../extensions/google-data-store-search/synthesis.ts";

const source = { name: "wiki", dataStoreId: "store" };

test("completed text replaces streamed deltas without duplication", () => {
  const records = [
    { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "partial" } },
    { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "complete" }] } },
  ];
  assert.equal(parsePiJson(records.map(record => JSON.stringify(record)).join("\n")), "complete");
});

test("parse and validate summary JSON", () => {
  assert.equal(parseSynthesis('```json\n{"answer":"ok","documents":[]}\n```').answer, "ok");
  for (const text of ['{"answer":42,"documents":[]}', '{"answer":"ok","documents":[null]}', "not JSON"]) {
    assert.throws(() => parseSynthesis(text));
  }
});

test("child has no tools, project trust, extensions or contextual resources", () => {
  const args = subagentArgs("provider", "model", "/tmp/prompt");
  for (const flag of ["--no-tools", "--no-extensions", "--no-context-files", "--no-skills", "--no-approve", "--no-session"]) {
    assert.ok(args.includes(flag));
  }
});

test("disabled synthesis makes no subprocess call", async () => {
  assert.equal(await synthesizeResults({ query: "q", source, rawResults: "raw", env: { GOOGLE_DATA_STORE_SUBAGENT: "0" },
    runner: async () => { assert.fail("No subprocess"); } }), undefined);
});

test("runner receives configured provider and model", async () => {
  const result = await synthesizeResults({ query: "q", source, rawResults: "raw", env: {
    GOOGLE_DATA_STORE_SUBAGENT_PROVIDER: "test", GOOGLE_DATA_STORE_SUBAGENT_MODEL: "model",
  }, runner: async options => {
    assert.equal(options.provider, "test");
    assert.equal(options.model, "model");
    return '{"answer":"ok","documents":[]}';
  } });
  assert.equal(result?.answer, "ok");
});

test("subprocess output parses and temporary directory is removed", async () => {
  let directory = "";
  const text = await runPiSubagent({ provider: "p", model: "m", prompt: "fixture" }, (_args, options) => {
    directory = options.cwd;
    return spawn(process.execPath, ["-e", 'console.log(JSON.stringify({type:"message_end",message:{role:"assistant",content:[{type:"text",text:"ok"}]}}))'],
      { ...options, stdio: ["ignore", "pipe", "pipe"] });
  });
  assert.equal(text, "ok");
  await assert.rejects(access(directory));
});

test("timeout terminates child and cleans temporary directory", async () => {
  let directory = "";
  await assert.rejects(runPiSubagent({ provider: "p", model: "m", prompt: "fixture", timeoutMs: 100 }, (_args, options) => {
    directory = options.cwd;
    return spawn(process.execPath, ["-e", 'setInterval(()=>{},1000)'], { ...options, stdio: ["ignore", "pipe", "pipe"] });
  }), /timed out/);
  await assert.rejects(access(directory));
});

test("pre-aborted invocation does not launch a process", async () => {
  await assert.rejects(runPiSubagent({ provider: "p", model: "m", prompt: "fixture", signal: AbortSignal.abort() }, () => {
    assert.fail("No process should launch");
  }), { name: "AbortError" });
});

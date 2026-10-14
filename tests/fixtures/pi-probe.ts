import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerSearch from "../../extensions/google-data-store-search/index.ts";
import registerProcessContent from "../../extensions/process-content/index.ts";

// Load the real factory through Pi and retain its registered execute callback.
// Command contexts cannot use the SDK's tool-only executeTool method.
export default function probe(pi: ExtensionAPI) {
  let search: Parameters<ExtensionAPI["registerTool"]>[0];
  registerSearch(new Proxy(pi, {
    get(target, property) {
      if (property === "registerTool") return (tool: typeof search) => {
        search = tool;
        return target.registerTool(tool);
      };
      return Reflect.get(target, property);
    },
  }));
  let processor: Parameters<ExtensionAPI["registerTool"]>[0];
  registerProcessContent(new Proxy(pi, {
    get(target, property) {
      if (property === "registerTool") return (tool: typeof processor) => {
        processor = tool;
        return target.registerTool(tool);
      };
      return Reflect.get(target, property);
    },
  }));
  pi.registerCommand("bootstrap-smoke", {
    description: "Verify registration and source validation without network requests.",
    handler: async (_args, ctx) => {
      if (!pi.getAllTools().some(tool => tool.name === "google_data_store_search")) {
        throw new Error("Search tool was not registered.");
      }
      let rejected = false;
      try {
        // This error path returns before any tool-context/model/network access.
        await search.execute("probe", { query: "offline registration test", source: "not-configured" },
          new AbortController().signal, undefined, {
            ...ctx, tools: [],
            executeTool: async () => { throw new Error("Nested tools are not allowed in this probe."); },
          });
      } catch (error) {
        rejected = String(error).includes("Source is unknown or ambiguous");
      }
      if (!rejected) throw new Error("Source validation did not reject the test source.");
      const registered = pi.getAllTools().find(tool => tool.name === "process_content");
      if (!registered || registered.exposure !== "codemode" || pi.getActiveTools().includes("process_content")) {
        throw new Error("Content processor exposure is incorrect: " + JSON.stringify({registered, active: pi.getActiveTools()}));
      }
      let calls = 0;
      const result = await processor.execute("process-probe", { content: "synthetic data", instruction: "Extract status" },
        new AbortController().signal, undefined, {
          ...ctx,
          modelRegistry: {
            find: (provider: string, id: string) => ({ provider, id, contextWindow: 200000 }),
            hasConfiguredAuth: () => true,
            streamSimple: (model: any, context: any) => {
              calls++;
              if (context.tools || context.messages.length !== 1) throw new Error("Not isolated");
              return { result: async () => ({ provider: model.provider, model: model.id, stopReason: "stop",
                content: [{ type: "text", text: '{"result":"synthetic OK","sourceIds":[],"warnings":[]}' }] }) };
            },
          },
        } as any);
      if (calls !== 1 || result.isError || (result.structuredContent as any)?.result !== "synthetic OK") {
        throw new Error("Content processor factory/execute integration failed.");
      }
      ctx.ui.notify("PI_BOOTSTRAP_SMOKE_OK", "info");
    },
  });
}

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerSearch from "../../extensions/google-data-store-search/index.ts";

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
      ctx.ui.notify("PI_BOOTSTRAP_SMOKE_OK", "info");
    },
  });
}

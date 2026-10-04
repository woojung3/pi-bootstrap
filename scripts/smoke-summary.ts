// Opt-in test: invokes a real model through Pi using synthetic public-safe text.
import { synthesizeResults } from "../extensions/google-data-store-search/synthesis.ts";

const [provider, model] = process.argv.slice(2);
if (!provider || !model) {
  console.error("Usage: npm run test:pi:live -- <provider> <model>");
  process.exit(2);
}
const result = await synthesizeResults({
  query: "테스트 문서에 따르면 서비스 상태는 무엇인가요?",
  source: { name: "synthetic-fixture", dataStoreId: "fixture" },
  rawResults: "1. Synthetic health document\nURL: https://example.test/health\nContent: The test service is healthy. This is synthetic test data, not a real company document.",
  model: { provider, id: model },
  env: { GOOGLE_DATA_STORE_SUBAGENT: "1" },
});
if (!result?.answer || !result.documents.some(document => document.url === "https://example.test/health")) {
  throw new Error("Live summary did not preserve the required answer and citation.");
}
console.log("Real Pi/model summary: valid JSON, non-empty answer, source URL preserved.");

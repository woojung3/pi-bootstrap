#!/usr/bin/env python3
"""Validate the checked-in Pi model catalog before installation."""

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODEL_FILE = ROOT / "config" / "models.json"
REQUIRED_MODELS = {
    "claude-sonnet-5-5": (1_000_000, 128_000, {"text", "image"}, True),
    "claude-haiku-5-5": (1_000_000, 128_000, {"text", "image"}, True),
    "claude-sonnet-5": (1_000_000, 128_000, {"text", "image"}, True),
    "claude-haiku-4-5": (200_000, 8_192, {"text", "image"}, True),
    "gemini-3.8-flash": (1_048_576, 65_536, {"text", "image"}, True),
    "glm-5.2": (1_000_000, 64_000, {"text"}, True),
    "grok-4.6": (524_288, 32_768, {"text", "image"}, True),
    "chatgpt-6-astra": (372_000, 128_000, {"text", "image"}, True),
    "claude-opus-5-5": (1_000_000, 128_000, {"text", "image"}, True),
    "chatgpt-6-sol": (1_050_000, 128_000, {"text", "image"}, True),
    "chatgpt-6.1-sol": (1_050_000, 128_000, {"text", "image"}, True),
    "chatgpt-6-luna": (1_050_000, 128_000, {"text", "image"}, True),
}


def fail(message: str) -> None:
    raise SystemExit(f"models.json validation failed: {message}")


def main() -> None:
    try:
        config = json.loads(MODEL_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(str(error))

    provider = config.get("providers", {}).get("litellm")
    if not isinstance(provider, dict):
        fail("providers.litellm must be an object")
    if provider.get("api") != "openai-completions":
        fail("LiteLLM must use the openai-completions API")
    if provider.get("apiKey") != "$LITELLM_API_KEY":
        fail("LiteLLM apiKey must reference $LITELLM_API_KEY")

    models = provider.get("models")
    if not isinstance(models, list) or not models:
        fail("providers.litellm.models must be a non-empty array")
    ids = [model.get("id") for model in models if isinstance(model, dict)]
    if len(ids) != len(models) or any(not isinstance(model_id, str) for model_id in ids):
        fail("every model must have a string id")
    duplicates = sorted({model_id for model_id in ids if ids.count(model_id) > 1})
    if duplicates:
        fail(f"duplicate model ids: {', '.join(duplicates)}")

    by_id = {model["id"]: model for model in models}
    for model_id, (context, output, inputs, reasoning) in REQUIRED_MODELS.items():
        model = by_id.get(model_id)
        if model is None:
            fail(f"required model missing: {model_id}")
        if model.get("contextWindow") != context or model.get("maxTokens") != output:
            fail(f"token limits do not match the accepted contract: {model_id}")
        if set(model.get("input", [])) != inputs:
            fail(f"input modalities do not match the accepted contract: {model_id}")
        if model.get("reasoning") is not reasoning:
            fail(f"reasoning metadata does not match the accepted contract: {model_id}")

    forbidden = {"grok-4.3", "grok-4.5", "gemini-4-argon"}
    if forbidden.intersection(by_id) or any("argon" in model_id.lower() for model_id in ids):
        fail("retired Grok models and deferred Gemini Argon must not be exposed")
    for alias, fixed, cost, thinking in (
        ("sonnet", "claude-sonnet-5-5",
         {"input": 2, "output": 10, "cacheRead": 0.2, "cacheWrite": 2.5},
         {"off": None, "minimal": "low"}),
        ("haiku", "claude-haiku-5-5",
         {"input": 0.5, "output": 2.5, "cacheRead": 0.05, "cacheWrite": 0.625},
         {"minimal": "low"}),
    ):
        model = by_id[fixed]
        if model.get("cost") != cost:
            fail(f"Gateway conservative prices do not match: {fixed}")
        if model.get("thinkingLevelMap") != thinking:
            fail(f"verified Pi thinking mapping does not match: {fixed}")
        if model.get("compat") != {"supportsReasoningEffort": True}:
            fail(f"reasoning effort compatibility does not match: {fixed}")
        metadata = lambda entry: {k: v for k, v in entry.items() if k not in ("id", "name")}
        if alias not in by_id or metadata(by_id[alias]) != metadata(model):
            fail(f"role alias metadata differs from {fixed}: {alias}")

    print(f"models.json validation passed ({len(models)} LiteLLM models)")


if __name__ == "__main__":
    main()

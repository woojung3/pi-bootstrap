#!/usr/bin/env python3
"""Validate the checked-in Pi model catalog before installation."""

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODEL_FILE = ROOT / "config" / "models.json"
REQUIRED_MODELS = {
    "gemini-3.8-flash": (1_048_576, 65_536, {"text", "image"}, True),
    "glm-5.2": (1_000_000, 64_000, {"text"}, True),
    "grok-4.6": (524_288, 32_768, {"text", "image"}, True),
    "chatgpt-6-astra": (372_000, 128_000, {"text", "image"}, True),
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

    print(f"models.json validation passed ({len(models)} LiteLLM models)")


if __name__ == "__main__":
    main()

import type { ExtensionAPI, ExtensionCommandContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";

const STATE_FILE_PATH = path.join(homedir(), ".pi", "agent", "yolo-state.json");

interface YoloState {
	approvalMode: "always-ask" | "yolo";
}

/**
 * Read-only tools never mutate the workspace, so they are auto-approved even in
 * always-ask mode. Everything else (write/edit/replace/bash + any custom tool)
 * is gated.
 */
const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);

export default function piYoloExtension(pi: ExtensionAPI): void {
	pi.registerCommand("yolo", {
		description: "Toggle YOLO mode on/off",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const state = await loadState();
			state.approvalMode = state.approvalMode === "always-ask" ? "yolo" : "always-ask";
			await saveState(state);
			const isYolo = state.approvalMode === "yolo";
			ctx.ui.notify(
				isYolo ? "YOLO mode: on — tools run without asking" : "YOLO mode: off — asking before changes",
				"info",
			);
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		const state = await loadState();

		// YOLO on → never gate. No UI to prompt with → can't ask, so let it run.
		if (state.approvalMode !== "always-ask" || !ctx.hasUI) {
			return undefined;
		}

		// Read-only tools are harmless; don't interrupt for them.
		if (READ_ONLY_TOOLS.has(event.toolName)) {
			return undefined;
		}

		// pi already renders a rich native preview (file content for `write`, a
		// red/green diff for `edit`, the command for `bash`) directly above this
		// prompt, so we only need a concise confirmation — not a dump of the args.
		const { title, message } = describeToolCall(event);
		const approved = await ctx.ui.confirm(title, message);

		if (!approved) {
			return { block: true, reason: "Rejected by user" };
		}
		return undefined;
	});
}

/** Build a short, human-readable confirmation from the tool call. */
function describeToolCall(event: ToolCallEvent): { title: string; message: string } {
	const input = (event.input ?? {}) as Record<string, unknown>;

	switch (event.toolName) {
		case "write":
			return { title: "Allow write?", message: targetPath(input) ?? "(unknown path)" };
		case "edit":
		case "replace":
			return { title: `Allow ${event.toolName}?`, message: targetPath(input) ?? "(unknown path)" };
		case "bash":
			return { title: "Allow bash?", message: truncate(asString(input.command) ?? "(no command)", 1000) };
		default:
			return { title: `Allow ${event.toolName}?`, message: summarizeArgs(input) };
	}
}

function targetPath(input: Record<string, unknown>): string | undefined {
	return asString(input.path) ?? asString(input.file_path);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/** Compact one-line-ish summary of args for tools we don't special-case. */
function summarizeArgs(input: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(input)) {
		if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
			parts.push(`${key}: ${truncate(String(value), 120)}`);
		} else if (value !== undefined && value !== null) {
			parts.push(`${key}: …`);
		}
	}
	return parts.length > 0 ? truncate(parts.join("\n"), 1000) : "Review the preview above.";
}

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + "…";
}

async function loadState(): Promise<YoloState> {
	try {
		const raw = await fs.readFile(STATE_FILE_PATH, "utf-8");
		const parsed = JSON.parse(raw) as Partial<YoloState>;
		return {
			approvalMode: parsed.approvalMode === "always-ask" ? "always-ask" : "yolo",
		};
	} catch {
		return { approvalMode: "yolo" };
	}
}

async function saveState(state: YoloState): Promise<void> {
	await fs.mkdir(path.dirname(STATE_FILE_PATH), { recursive: true }).catch(() => {});
	await fs.writeFile(STATE_FILE_PATH, JSON.stringify(state, null, 2) + "\n").catch(() => {});
}

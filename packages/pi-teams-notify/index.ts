import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = path.join(homedir(), ".pi", "agent", "teams-notify.json");
const STATUS_KEY = "teams-notify";
const MAX_TEXT_LENGTH = 1800;
const DEFAULT_SMART = {
	minimumDurationSeconds: 60,
	minimumTurns: 10,
	minimumToolCalls: 10,
	alwaysNotifyGoalCompletion: true,
};

type NotifyMode = "off" | "smart" | "all";
interface SmartConfig {
	minimumDurationSeconds: number;
	minimumTurns: number;
	minimumToolCalls: number;
	alwaysNotifyGoalCompletion: boolean;
}
interface Config {
	mode: NotifyMode;
	webhookUrl?: string;
	notifyNext: boolean;
	smart: SmartConfig;
}

let activePrompt = "";
let lastAnswer = "";
let startedAt = 0;
let turnCount = 0;
let toolCallCount = 0;
let goalFinished = false;

export default function piTeamsNotify(pi: ExtensionAPI): void {
	pi.registerCommand("teams-notify", {
		description: "Configure Teams notifications: smart, all, off, next, status, or test",
		handler: async (args, ctx) => handleCommand(args.trim().toLowerCase(), ctx),
	});

	pi.on("session_start", async (_event, ctx) => updateStatus(ctx, await loadConfig()));

	pi.on("before_agent_start", (event) => {
		activePrompt = event.prompt;
		lastAnswer = "";
		startedAt = Date.now();
		turnCount = 0;
		toolCallCount = 0;
		goalFinished = false;
	});

	pi.on("turn_start", () => {
		turnCount += 1;
	});

	pi.on("tool_execution_start", (event) => {
		toolCallCount += 1;
		if (event.toolName === "goal_complete" || event.toolName === "goal_blocked") goalFinished = true;
	});

	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;
		lastAnswer = textFromContent(event.message.content);
	});

	// Retries, compaction retries, and queued follow-ups have all finished here.
	pi.on("agent_settled", async (_event, ctx) => {
		const config = await loadConfig();
		if (!activePrompt || config.mode === "off") return;

		const elapsedMs = startedAt ? Date.now() - startedAt : 0;
		const shouldNotify =
			config.mode === "all" ||
			config.notifyNext ||
			(config.mode === "smart" && smartThresholdReached(config.smart, elapsedMs));

		if (config.notifyNext) {
			config.notifyNext = false;
			await saveConfig(config);
			updateStatus(ctx, config);
		}
		if (!shouldNotify) {
			clearRun();
			return;
		}

		const url = webhookUrl(config);
		if (!url) {
			clearRun();
			ctx.ui.notify(`Teams 알림을 보내지 못했습니다: ${CONFIG_PATH}에 webhookUrl을 설정하세요.`, "warning");
			return;
		}

		const prompt = activePrompt;
		const answer = lastAnswer;
		const duration = formatDuration(elapsedMs);
		const metrics = `${turnCount} turns · ${toolCallCount} tools`;
		clearRun();

		const title = `✅ Pi 작업 완료 · ${path.basename(ctx.cwd) || ctx.cwd}`;
		const body = [
			`**요청**\n\n${truncate(prompt, MAX_TEXT_LENGTH)}`,
			answer ? `**결과**\n\n${truncate(answer, MAX_TEXT_LENGTH)}` : "",
			`**경로:** \`${ctx.cwd}\`  \n**소요 시간:** ${duration} · ${metrics}`,
		].filter(Boolean).join("\n\n");

		try {
			await sendTeams(url, title, body);
		} catch (error) {
			ctx.ui.notify(`Teams 알림 전송 실패: ${errorMessage(error)}`, "warning");
		}
	});
}

async function handleCommand(action: string, ctx: ExtensionCommandContext): Promise<void> {
	const config = await loadConfig();

	if (action === "smart" || action === "on" || action === "all" || action === "off") {
		config.mode = action === "on" ? "smart" : action;
		if (config.mode === "off") config.notifyNext = false;
		await saveConfig(config);
		updateStatus(ctx, config);
		ctx.ui.notify(modeDescription(config), config.mode !== "off" && !webhookUrl(config) ? "warning" : "info");
		return;
	}

	if (action === "next") {
		config.mode = config.mode === "off" ? "smart" : config.mode;
		config.notifyNext = true;
		await saveConfig(config);
		updateStatus(ctx, config);
		ctx.ui.notify("다음 작업은 Smart 조건과 관계없이 Teams로 알립니다.", "info");
		return;
	}

	if (action === "" || action === "status") {
		const source = process.env.TEAMS_WEBHOOK_URL ? "환경변수" : config.webhookUrl ? CONFIG_PATH : "미설정";
		ctx.ui.notify(`${modeDescription(config)} · webhook: ${source}\n사용법: /teams-notify [smart|all|off|next|test]`, "info");
		return;
	}

	if (action === "test") {
		const url = webhookUrl(config);
		if (!url) {
			ctx.ui.notify(`webhook이 없습니다. ${CONFIG_PATH} 또는 TEAMS_WEBHOOK_URL을 설정하세요.`, "error");
			return;
		}
		try {
			await sendTeams(url, "🧪 Pi Teams 알림 테스트", `연결에 성공했습니다.\n\n**경로:** \`${ctx.cwd}\``);
			ctx.ui.notify("Teams 테스트 알림을 보냈습니다.", "info");
		} catch (error) {
			ctx.ui.notify(`Teams 테스트 실패: ${errorMessage(error)}`, "error");
		}
		return;
	}

	ctx.ui.notify("사용법: /teams-notify [smart|all|off|next|status|test]", "warning");
}

function smartThresholdReached(smart: SmartConfig, elapsedMs: number): boolean {
	return (
		elapsedMs >= smart.minimumDurationSeconds * 1000 ||
		turnCount >= smart.minimumTurns ||
		toolCallCount >= smart.minimumToolCalls ||
		(smart.alwaysNotifyGoalCompletion && goalFinished)
	);
}

function updateStatus(ctx: ExtensionContext, config: Config): void {
	// pi-statusline recognizes a leading emoji and renders this through its compact
	// extension-status format. Keeping the value short prevents footer wrapping.
	const value = config.mode === "off" ? undefined : `🔔 ${config.notifyNext ? "next" : config.mode}`;
	ctx.ui.setStatus(STATUS_KEY, value);
}

function modeDescription(config: Config): string {
	if (config.mode === "off") return "Teams 알림: 꺼짐";
	if (config.notifyNext) return `Teams 알림: next (${config.mode}로 복귀)`;
	if (config.mode === "all") return "Teams 알림: 모든 작업";
	const smart = config.smart;
	return `Teams 알림: Smart (${smart.minimumDurationSeconds}초 또는 ${smart.minimumTurns} turns 또는 ${smart.minimumToolCalls} tools)`;
}

async function loadConfig(): Promise<Config> {
	try {
		const parsed = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8")) as Record<string, unknown>;
		const legacyEnabled = parsed.enabled === true;
		return {
			mode: isMode(parsed.mode) ? parsed.mode : legacyEnabled ? "smart" : "off",
			webhookUrl: cleanUrl(parsed.webhookUrl),
			notifyNext: parsed.notifyNext === true,
			smart: normalizeSmart(parsed.smart),
		};
	} catch {
		return { mode: "off", notifyNext: false, smart: { ...DEFAULT_SMART } };
	}
}

async function saveConfig(config: Config): Promise<void> {
	await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
	await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
	await fs.chmod(CONFIG_PATH, 0o600);
}

function normalizeSmart(value: unknown): SmartConfig {
	const smart = value && typeof value === "object" ? value as Record<string, unknown> : {};
	return {
		minimumDurationSeconds: positiveNumber(smart.minimumDurationSeconds, DEFAULT_SMART.minimumDurationSeconds),
		minimumTurns: positiveNumber(smart.minimumTurns, DEFAULT_SMART.minimumTurns),
		minimumToolCalls: positiveNumber(smart.minimumToolCalls, DEFAULT_SMART.minimumToolCalls),
		alwaysNotifyGoalCompletion: smart.alwaysNotifyGoalCompletion !== false,
	};
}

function positiveNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isMode(value: unknown): value is NotifyMode {
	return value === "off" || value === "smart" || value === "all";
}

function webhookUrl(config: Config): string | undefined {
	return cleanUrl(process.env.TEAMS_WEBHOOK_URL) ?? cleanUrl(config.webhookUrl);
}

function cleanUrl(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function sendTeams(url: string, title: string, text: string): Promise<void> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			"@type": "MessageCard",
			"@context": "http://schema.org/extensions",
			themeColor: "00BFFF",
			summary: title,
			sections: [{ activityTitle: title, text, markdown: true }],
		}),
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}: ${truncate(await response.text(), 300)}`);
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : "")
		.filter(Boolean)
		.join("\n")
		.trim();
}

function clearRun(): void {
	activePrompt = "";
	lastAnswer = "";
	startedAt = 0;
	turnCount = 0;
	toolCallCount = 0;
	goalFinished = false;
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

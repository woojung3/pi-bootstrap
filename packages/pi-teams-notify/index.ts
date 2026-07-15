import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = path.join(homedir(), ".pi", "agent", "teams-notify.json");
const STATUS_KEY = "teams-notify";
const AI_INPUT_MAX_LENGTH = 4000;
const DEFAULT_SMART = {
	minimumDurationSeconds: 60,
	minimumTurns: 10,
	minimumToolCalls: 10,
	alwaysNotifyGoalCompletion: true,
};
const DEFAULT_SUMMARY = {
	mode: "auto" as SummaryMode,
	provider: "litellm",
	model: "gemini-3.1-flash-lite",
	maximumLength: 140,
	timeoutSeconds: 5,
};

type NotifyMode = "off" | "smart" | "all";
type SummaryMode = "auto" | "ai" | "mechanical" | "off";
type GoalOutcome = "complete" | "blocked" | undefined;
interface SmartConfig {
	minimumDurationSeconds: number;
	minimumTurns: number;
	minimumToolCalls: number;
	alwaysNotifyGoalCompletion: boolean;
}
interface SummaryConfig {
	mode: SummaryMode;
	provider: string;
	model: string;
	maximumLength: number;
	timeoutSeconds: number;
}
interface Config {
	mode: NotifyMode;
	webhookUrl?: string;
	notifyNext: boolean;
	smart: SmartConfig;
	summary: SummaryConfig;
}

let activePrompt = "";
let lastAnswer = "";
let startedAt = 0;
let turnCount = 0;
let toolCallCount = 0;
let goalOutcome: GoalOutcome;

export default function piTeamsNotify(pi: ExtensionAPI): void {
	pi.registerCommand("teams-notify", {
		description: "Configure Teams notifications: smart, all, off, next, summary, status, or test",
		handler: async (args, ctx) => handleCommand(args.trim().toLowerCase(), ctx),
	});

	pi.on("session_start", async (_event, ctx) => updateStatus(ctx, await loadConfig()));

	pi.on("before_agent_start", (event) => {
		activePrompt = event.prompt;
		lastAnswer = "";
		startedAt = Date.now();
		turnCount = 0;
		toolCallCount = 0;
		goalOutcome = undefined;
	});

	pi.on("turn_start", () => {
		turnCount += 1;
	});

	pi.on("tool_execution_start", (event) => {
		toolCallCount += 1;
		if (event.toolName === "goal_complete") goalOutcome = "complete";
		if (event.toolName === "goal_blocked") goalOutcome = "blocked";
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
		const outcome = goalOutcome;
		const duration = formatDuration(elapsedMs);
		const metrics = `${duration} · ${turnCount} turns · ${toolCallCount} tools`;
		const summary = await summarizeRun(prompt, answer, config.summary, ctx);
		clearRun();

		const title = outcome === "blocked"
			? `⛔ Pi 확인 필요 · ${path.basename(ctx.cwd) || ctx.cwd}`
			: `✅ Pi 작업 완료 · ${path.basename(ctx.cwd) || ctx.cwd}`;
		const body = [summary, metrics].filter(Boolean).join("\n\n");

		try {
			await sendTeams(url, title, body);
		} catch (error) {
			ctx.ui.notify(`Teams 알림 전송 실패: ${errorMessage(error)}`, "warning");
		}
	});
}

async function handleCommand(action: string, ctx: ExtensionCommandContext): Promise<void> {
	const config = await loadConfig();
	const [command, value, ...extra] = action.split(/\s+/).filter(Boolean);

	if (command === "summary" && isSummaryMode(value) && extra.length === 0) {
		config.summary.mode = value;
		await saveConfig(config);
		ctx.ui.notify(`Teams 한 줄 요약: ${value}`, "info");
		return;
	}

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
		ctx.ui.notify(`${modeDescription(config)} · 한 줄 요약: ${config.summary.mode} · webhook: ${source}\n사용법: /teams-notify [smart|all|off|next|summary <auto|ai|mechanical|off>|test]`, "info");
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

	ctx.ui.notify("사용법: /teams-notify [smart|all|off|next|status|summary <auto|ai|mechanical|off>|test]", "warning");
}

function smartThresholdReached(smart: SmartConfig, elapsedMs: number): boolean {
	return (
		elapsedMs >= smart.minimumDurationSeconds * 1000 ||
		turnCount >= smart.minimumTurns ||
		toolCallCount >= smart.minimumToolCalls ||
		(smart.alwaysNotifyGoalCompletion && goalOutcome !== undefined)
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
			summary: normalizeSummary(parsed.summary),
		};
	} catch {
		return {
			mode: "off",
			notifyNext: false,
			smart: { ...DEFAULT_SMART },
			summary: { ...DEFAULT_SUMMARY },
		};
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

function normalizeSummary(value: unknown): SummaryConfig {
	const summary = value && typeof value === "object" ? value as Record<string, unknown> : {};
	return {
		mode: isSummaryMode(summary.mode) ? summary.mode : DEFAULT_SUMMARY.mode,
		provider: cleanString(summary.provider) ?? DEFAULT_SUMMARY.provider,
		model: cleanString(summary.model) ?? DEFAULT_SUMMARY.model,
		maximumLength: boundedPositiveNumber(summary.maximumLength, DEFAULT_SUMMARY.maximumLength, 40, 500),
		timeoutSeconds: boundedPositiveNumber(summary.timeoutSeconds, DEFAULT_SUMMARY.timeoutSeconds, 1, 30),
	};
}

function positiveNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function boundedPositiveNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
		? value
		: fallback;
}

function isMode(value: unknown): value is NotifyMode {
	return value === "off" || value === "smart" || value === "all";
}

function isSummaryMode(value: unknown): value is SummaryMode {
	return value === "auto" || value === "ai" || value === "mechanical" || value === "off";
}

function webhookUrl(config: Config): string | undefined {
	return cleanUrl(process.env.TEAMS_WEBHOOK_URL) ?? cleanUrl(config.webhookUrl);
}

function cleanUrl(value: unknown): string | undefined {
	return cleanString(value);
}

function cleanString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function summarizeRun(
	prompt: string,
	answer: string,
	config: SummaryConfig,
	ctx: ExtensionContext,
): Promise<string> {
	if (config.mode === "off") return "";
	const fallback = mechanicalSummary(prompt, answer, config.maximumLength);
	if (config.mode === "mechanical") return fallback;

	const model = ctx.modelRegistry.find(config.provider, config.model);
	if (!model) return fallback;

	const input = [
		"다음 요청과 결과를 바탕으로 수행한 작업을 한국어 한 문장으로 요약하세요.",
		`${config.maximumLength}자 이하로 작성하고 줄바꿈, 마크다운, 접두사, 감상 표현 없이 요약문만 출력하세요.`,
		`\n<요청>\n${truncate(prompt, AI_INPUT_MAX_LENGTH)}\n</요청>`,
		`\n<결과>\n${truncate(answer, AI_INPUT_MAX_LENGTH)}\n</결과>`,
	].join("\n");

	try {
		const signal = AbortSignal.timeout(config.timeoutSeconds * 1000);
		const auth = await withAbort(ctx.modelRegistry.getApiKeyAndHeaders(model), signal);
		if (!auth.ok || !auth.apiKey) return fallback;
		const response = await completeSimple(
			model,
			{
				messages: [{
					role: "user",
					content: [{ type: "text", text: input }],
					timestamp: Date.now(),
				}],
			},
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				env: auth.env,
				maxTokens: 256,
				reasoning: "minimal",
				signal,
			},
		);
		const generated = response.content
			.filter((part): part is { type: "text"; text: string } => part.type === "text")
			.map((part) => part.text)
			.join(" ");
		return normalizeOneLine(generated, config.maximumLength) || fallback;
	} catch {
		// Summarization is best-effort. A notification must never fail or become noisy
		// merely because the optional model is unavailable or slow.
		return fallback;
	}
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
	});
}

export function mechanicalSummary(prompt: string, answer: string, maximumLength: number): string {
	const request = firstMeaningfulSentence(prompt);
	const result = firstMeaningfulSentence(answer);
	if (!request) return truncate(result, maximumLength);
	if (!result) return truncate(request, maximumLength);

	const separator = " → ";
	const available = maximumLength - separator.length;
	const requestLength = Math.max(1, Math.floor(available * 0.4));
	const resultLength = Math.max(1, available - requestLength);
	return `${truncate(request, requestLength)}${separator}${truncate(result, resultLength)}`;
}

function firstMeaningfulSentence(text: string): string {
	const withoutCode = text
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/!?(?:\[([^\]]+)\])\([^)]*\)/g, "$1")
		.replace(/^\s{0,3}(?:#{1,6}|[-*+]|\d+[.)])\s+/gm, "")
		.split(/\n+/)
		.map((line) => normalizeOneLine(line, Number.MAX_SAFE_INTEGER))
		.find((line) => Boolean(line) && !/^(?:요청|결과|응답|답변|작업|summary)$/i.test(line)) ?? "";
	const sentence = withoutCode.match(/^.*?[.!?。！？](?:\s|$)/)?.[0] ?? withoutCode;
	return sentence.trim();
}

export function normalizeOneLine(text: string, maximumLength: number): string {
	const normalized = text
		.replace(/```[a-zA-Z0-9_-]*|```/g, " ")
		.replace(/^\s*["'“”‘’]+|["'“”‘’]+\s*$/g, "")
		.replace(/^\s*(?:요약|summary)\s*:\s*/i, "")
		.replace(/\s+/g, " ")
		.trim();
	return truncate(normalized, maximumLength);
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
	goalOutcome = undefined;
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

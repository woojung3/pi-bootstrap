import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = path.join(homedir(), ".pi", "agent", "teams-notify.json");
const STATUS_KEY = "teams-notify";
const MAX_TEXT_LENGTH = 1800;

interface Config {
	enabled: boolean;
	webhookUrl?: string;
}

let activePrompt = "";
let lastAnswer = "";
let startedAt = 0;

export default function piTeamsNotify(pi: ExtensionAPI): void {
	pi.registerCommand("teams-notify", {
		description: "Configure Teams notifications: on, off, status, or test",
		handler: async (args, ctx) => handleCommand(args.trim().toLowerCase(), ctx),
	});

	pi.on("session_start", async (_event, ctx) => updateStatus(ctx, await loadConfig()));

	pi.on("before_agent_start", (event) => {
		activePrompt = event.prompt;
		lastAnswer = "";
		startedAt = Date.now();
	});

	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;
		lastAnswer = textFromContent(event.message.content);
	});

	// agent_settled is later than agent_end: retries, compaction retries, and queued
	// follow-ups have all finished, so this is the user's actual "work is done" point.
	pi.on("agent_settled", async (_event, ctx) => {
		const config = await loadConfig();
		if (!config.enabled || !activePrompt) return;

		const url = webhookUrl(config);
		if (!url) {
			ctx.ui.notify(`Teams 알림을 보내지 못했습니다: ${CONFIG_PATH}에 webhookUrl을 설정하세요.`, "warning");
			return;
		}

		const prompt = activePrompt;
		const answer = lastAnswer;
		const duration = startedAt ? formatDuration(Date.now() - startedAt) : "-";
		// Consume this run before awaiting the network, preventing duplicate sends.
		activePrompt = "";
		lastAnswer = "";
		startedAt = 0;

		const title = `✅ Pi 작업 완료 · ${path.basename(ctx.cwd) || ctx.cwd}`;
		const body = [
			`**요청**\n\n${truncate(prompt, MAX_TEXT_LENGTH)}`,
			answer ? `**결과**\n\n${truncate(answer, MAX_TEXT_LENGTH)}` : "",
			`**경로:** \`${ctx.cwd}\`  \n**소요 시간:** ${duration}`,
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

	if (action === "on" || action === "off" || action === "" || action === "toggle") {
		config.enabled = action === "on" ? true : action === "off" ? false : !config.enabled;
		await saveConfig(config);
		updateStatus(ctx, config);
		const source = process.env.TEAMS_WEBHOOK_URL ? "TEAMS_WEBHOOK_URL" : CONFIG_PATH;
		ctx.ui.notify(
			config.enabled
				? `Teams 완료 알림: 켜짐 (${webhookUrl(config) ? source : "webhook 미설정"})`
				: "Teams 완료 알림: 꺼짐",
			config.enabled && !webhookUrl(config) ? "warning" : "info",
		);
		return;
	}

	if (action === "status") {
		const source = process.env.TEAMS_WEBHOOK_URL ? "환경변수" : config.webhookUrl ? CONFIG_PATH : "미설정";
		ctx.ui.notify(`Teams 완료 알림: ${config.enabled ? "켜짐" : "꺼짐"} · webhook: ${source}`, "info");
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

	ctx.ui.notify("사용법: /teams-notify [on|off|status|test]", "warning");
}

function updateStatus(ctx: ExtensionContext, config: Config): void {
	ctx.ui.setStatus(STATUS_KEY, config.enabled ? "Teams: on" : undefined);
}

async function loadConfig(): Promise<Config> {
	try {
		const parsed = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8")) as Partial<Config>;
		return { enabled: parsed.enabled === true, webhookUrl: cleanUrl(parsed.webhookUrl) };
	} catch {
		return { enabled: false };
	}
}

async function saveConfig(config: Config): Promise<void> {
	await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
	await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
	await fs.chmod(CONFIG_PATH, 0o600);
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

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PI_MASTER_COURSE } from "./lib/course.js";
import type { AcademyContext, AcademyState } from "./lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STATE_FILE = ".pi-academy.json";
const TUTOR_SESSION = "pi-tutor.jsonl";
const TUTOR_TOOLS = ["read", "grep", "find", "ls"];
const GRADUATED_LEVEL = PI_MASTER_COURSE.length + 1;

export default function piAcademyExtension(pi: ExtensionAPI): void {
	// ── session_start: 튜터 세션일 경우 자동 채점 루프 실행 ──────────────────
	pi.on("session_start", async (event, ctx) => {
		const sessionFile = ctx.sessionManager.getSessionFile();
		const isTutorActive = sessionFile ? path.basename(sessionFile) === TUTOR_SESSION : false;
		if (isTutorActive && (event.reason === "resume" || event.reason === "startup" || event.reason === "new" || event.reason === "fork")) {
			const statePath = path.join(ctx.cwd, STATE_FILE);
			const state = await loadState(statePath);

			if (state.currentLevel < GRADUATED_LEVEL) {
				await pi.setActiveTools(TUTOR_TOOLS);
				ctx.ui.setTitle("🎓 Pi 실전 마스터 아카데미");
				await runVerifyLoop(pi, ctx as any, statePath, state, "");
				ctx.ui.setTitle("");
			}
		}
	});

	// ── before_agent_start: 튜터 프롬프트 주입 ──────────────────────────────
	pi.on("before_agent_start", async (event, ctx) => {
		const sessionFile = ctx.sessionManager.getSessionFile();
		const isTutorActive = sessionFile ? path.basename(sessionFile) === TUTOR_SESSION : false;
		if (isTutorActive) {
			const tutorMd = await fs.readFile(path.join(__dirname, "tutor.md"), "utf-8");
			return { systemPrompt: stripFrontmatter(tutorMd) };
		}
		return undefined;
	});

	// ── /tutorial 명령어: 아카데미 메인 로직 ─────────────────────────────────
	pi.registerCommand("tutorial", {
		description: "대화형 실전 Pi 10단계 마스터 아카데미를 시작하거나 이어서 진행합니다!",
		getArgumentCompletions: () => [
			{ label: "status - 현재 진척도 확인", value: "status" },
			{ label: "reset - 진척도 초기화", value: "reset" },
		],
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const arg = args.trim().toLowerCase();
			const statePath = path.join(ctx.cwd, STATE_FILE);
			const state = await loadState(statePath);

			if (arg === "reset") {
				await resetAcademy(ctx, statePath);
				return;
			}

			if (arg === "status") {
				if (state.currentLevel >= GRADUATED_LEVEL) {
					ctx.ui.notify("🎓 축하합니다! 이미 Pi 아카데미 전 과정을 졸업하셨습니다. 복습하려면 '/tutorial reset'을 실행하세요.", "info");
				} else {
					const step = PI_MASTER_COURSE[state.currentLevel - 1];
					ctx.ui.notify(`현재 학습 단계: ${state.currentLevel}/${PI_MASTER_COURSE.length} — ${step.title}`, "info");
				}
				return;
			}

			if (state.startCwd === null) {
				state.startCwd = ctx.cwd;
				await saveState(statePath, state);
			} else if (ctx.cwd !== state.startCwd) {
				ctx.ui.notify(`🎓 처음 시작한 경로(${state.startCwd})와 다릅니다. 원래 경로로 이동 후 다시 실행해 주세요!`, "error");
				return;
			}

			const sessionFile = ctx.sessionManager.getSessionFile();
			const isTutorActive = sessionFile ? path.basename(sessionFile) === TUTOR_SESSION : false;
			if (!isTutorActive) {
				await activateTutorSession(pi, ctx, sessionFile);
				return;
			}

			if (state.currentLevel >= GRADUATED_LEVEL) {
				await ctx.ui.confirm("🎓 Pi 아카데미 졸업 🎓", "이미 전 과정을 졸업하셨습니다! 🎉\n\n처음부터 복습하려면 이 창을 닫고 '/tutorial reset'을 입력하세요.");
				return;
			}

			if (state.currentLevel === 1) {
				const files = await fs.readdir(ctx.cwd).catch(() => [] as string[]);
				const stray = files.filter(f => !isAcademyArtifact(f));
				if (stray.length > 0) {
					await ctx.ui.confirm("🎓 Pi 아카데미 가동 조건", "상쾌한 시작을 위해 빈 디렉터리에서 실행하는 것을 강력히 권장합니다.\n\n현재 폴더가 비어있지 않습니다. 완전히 빈 새 폴더를 만들고 그 위치에서 다시 기동해 주세요!");
					return;
				}
			}

			await pi.setActiveTools(TUTOR_TOOLS);
			ctx.ui.setTitle("🎓 Pi 실전 마스터 아카데미");
			await runVerifyLoop(pi, ctx, statePath, state, args);
			ctx.ui.setTitle("");
		},
	});
}

function stripFrontmatter(markdown: string): string {
	const trimmed = markdown.replace(/^\uFEFF/, "");
	if (!trimmed.startsWith("---")) return markdown.trim();
	const end = trimmed.indexOf("\n---", 3);
	if (end === -1) return markdown.trim();
	return trimmed.slice(end + 4).trim();
}

async function loadState(statePath: string): Promise<AcademyState> {
	try {
		const raw = await fs.readFile(statePath, "utf-8");
		const parsed = JSON.parse(raw) as Partial<AcademyState>;
		return {
			currentLevel: typeof parsed.currentLevel === "number" && parsed.currentLevel >= 1 ? parsed.currentLevel : 1,
			startCwd: typeof parsed.startCwd === "string" ? parsed.startCwd : null,
		};
	} catch {
		return { currentLevel: 1, startCwd: null };
	}
}

async function saveState(statePath: string, state: AcademyState): Promise<void> {
	await fs.writeFile(statePath, JSON.stringify(state, null, 2) + "\n").catch(() => {});
}

async function runVerifyLoop(pi: ExtensionAPI, ctx: ExtensionCommandContext, statePath: string, state: AcademyState, args: string = ""): Promise<void> {
	const step = PI_MASTER_COURSE[state.currentLevel - 1];
	const academyCtx = buildAcademyContext(pi, ctx, args);
	const result = await step.verify(academyCtx);

	if (result === true) {
		ctx.ui.notify(step.unlockMessage.split("\n")[0], "info");
		if (step.onComplete) await step.onComplete(academyCtx);
		state.currentLevel += 1;
		await saveState(statePath, state);
		pi.sendMessage({ customType: "pi-academy-status", content: step.statusEvent, display: false }, { deliverAs: "steer", triggerTurn: true });
		if (state.currentLevel >= GRADUATED_LEVEL) {
			await ctx.ui.confirm("🏆 PI ACADEMY 수료 🏆", step.unlockMessage);
		} else {
			const next = PI_MASTER_COURSE[state.currentLevel - 1];
			await ctx.ui.confirm(`잠금 해제: ${state.currentLevel}단계 · ${next.title}`, step.unlockMessage + "\n\n" + next.missionGuide);
		}
		return;
	}

	if (result === false) {
		await ctx.ui.confirm(`미션 ${step.level}: ${step.title}`, step.missionGuide);
		return;
	}

	await ctx.ui.confirm(`미션 ${step.level} 검증 실패`, step.recoveryGuide(result.errorReason));
}

function buildAcademyContext(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string = ""): AcademyContext {
	return {
		cwd: ctx.cwd,
		cloneDir: path.join(ctx.cwd, "tutorial-clone"),
		referenceDir: path.join(ctx.cwd, "pi-reference"),
		isProjectTrusted: () => ctx.isProjectTrusted(),
		exec: (command, cmdArgs, options) => pi.exec(command, cmdArgs, options),
		args,
	};
}

async function activateTutorSession(pi: ExtensionAPI, ctx: ExtensionCommandContext, sessionFile: string | undefined): Promise<void> {
	if (!sessionFile) {
		ctx.ui.notify("세션 정보가 유실되었습니다. 튜터를 기동할 수 없습니다.", "error");
		return;
	}
	const tutorSessionFile = path.join(path.dirname(sessionFile), path.basename(sessionFile, ".jsonl"), TUTOR_SESSION);
	const exists = await fs.access(tutorSessionFile).then(() => true).catch(() => false);

	if (!exists) {
		const initEntry = { type: "session", version: 3, id: "pi-tutor-session", timestamp: new Date().toISOString(), cwd: ctx.cwd };
		await fs.mkdir(path.dirname(tutorSessionFile), { recursive: true });
		await fs.writeFile(tutorSessionFile, JSON.stringify(initEntry) + "\n");
	}

	await ctx.switchSession(tutorSessionFile, {
		withSession: async (replacedCtx) => {
			replacedCtx.ui.notify("🎓 Pi 아카데미 튜터 세션으로 전환되었습니다. '/tutorial'을 다시 실행해 주세요!", "info");
		},
	});
}

async function resetAcademy(ctx: ExtensionCommandContext, statePath: string): Promise<void> {
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (sessionFile) {
		const tutorSessionFile = path.basename(sessionFile) === TUTOR_SESSION
			? sessionFile
			: path.join(path.dirname(sessionFile), path.basename(sessionFile, ".jsonl"), TUTOR_SESSION);
		await fs.rm(tutorSessionFile, { force: true }).catch(() => {});
	}
	await fs.rm(path.join(ctx.cwd, "tutorial-clone"), { recursive: true, force: true }).catch(() => {});
	await fs.rm(path.join(ctx.cwd, "pi-reference"), { recursive: true, force: true }).catch(() => {});
	await fs.rm(statePath, { force: true }).catch(() => {});
	ctx.ui.notify("Pi 아카데미 진척도와 모든 실습용 폴더가 초기화되었습니다.", "warning");
}

function isAcademyArtifact(name: string): boolean {
	return name === ".git" || name === ".pi" || name === STATE_FILE || name === ".pi-academy.json" || name === "tutorial-clone" || name === "pi-reference";
}

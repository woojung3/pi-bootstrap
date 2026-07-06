// Pi 아카데미 — 실전형 10단계 코스 선언적 레지스트리
//
// 이 코스는 pi를 "쓰는 법"보다 "내 워크플로에 맞게 길들이는 법"에 초점을 둔다.
// AGENTS.md, prompt templates, skills, settings, extensions, packages, SDK/RPC를
// 모두 물리 파일 산출물로 만들어 검증한다.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AcademyContext, CourseStep } from "./types";

async function readText(p: string): Promise<string | null> {
	return fs.readFile(p, "utf-8").catch(() => null);
}

function clonePath(ctx: AcademyContext, ...parts: string[]): string {
	return path.join(ctx.cloneDir, ...parts);
}

function parseFrontmatter(text: string): { get: (key: string) => string | undefined } {
	const map = new Map<string, string>();
	const trimmed = text.replace(/^\uFEFF/, "");
	if (trimmed.startsWith("---")) {
		const end = trimmed.indexOf("\n---", 3);
		if (end !== -1) {
			for (const rawLine of trimmed.slice(3, end).split("\n")) {
				const m = /^([A-Za-z0-9_-]+)\s*:(.*)$/.exec(rawLine.trimEnd());
				if (m) map.set(m[1], m[2].trim().replace(/^["']|["']$/g, ""));
			}
		}
	}
	return { get: (key: string) => map.get(key) || undefined };
}

async function readJson(p: string): Promise<any | null> {
	const raw = await readText(p);
	if (raw === null) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function hasAll(text: string | null, needles: string[]): boolean {
	return !!text && needles.every(n => text.includes(n));
}

export const PI_MASTER_COURSE: readonly CourseStep[] = [
	{
		level: 1,
		phase: "1부 · 안전한 시작",
		title: "Project Trust와 실습 저장소 준비",
		description: "프로젝트 로컬 리소스가 언제 로드되는지 이해하고, 신뢰한 작업 공간에서 실습 저장소를 생성합니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_1_COMPLETE",
		missionGuide:
			"미션 1: Project Trust 이해하기\n\n" +
			"Pi는 .pi/settings.json, .pi/extensions, .pi/skills 같은 프로젝트 로컬 리소스를 로드하기 전에 Project Trust를 확인합니다.\n\n" +
			"1. 현재 아카데미 작업 디렉터리에서 /trust 를 실행해 신뢰 결정을 저장하세요.\n" +
			"2. 다시 /tutorial 을 실행하면 신뢰 상태를 검증하고 tutorial-clone/ 실습 저장소를 생성합니다.\n\n" +
			"신뢰하지 않는 외부 프로젝트에서는 -na 와 --tools read,grep,find,ls 조합을 우선 사용한다는 점도 기억하세요.",
		unlockMessage:
			"🎉 1단계 통과! Project Trust 경계를 확인했고 tutorial-clone/ 실습 저장소가 준비되었습니다.\n\n" +
			"다음 단계에서는 세션 이어가기, /tree, /fork, /clone이 어떤 문제를 해결하는지 익힙니다.",
		async verify(ctx) {
			if (!ctx.isProjectTrusted()) {
				return { success: false, errorReason: "현재 프로젝트가 아직 trust 상태가 아닙니다. TUI에서 /trust 를 실행한 뒤 pi를 재시작하거나 /tutorial 을 다시 실행하세요." };
			}
			return true;
		},
		recoveryGuide(reason) {
			return `미션 1 검증 실패\n\n${reason ?? "Project Trust가 필요합니다."}\n\n- /trust 실행\n- 필요하면 pi 재시작\n- /tutorial 재실행`;
		},
		async onComplete(ctx) {
			await fs.rm(ctx.cloneDir, { recursive: true, force: true }).catch(() => {});
			await fs.mkdir(clonePath(ctx, "src"), { recursive: true });
			await fs.writeFile(clonePath(ctx, "src", "math.ts"), "export function add(a: number, b: number): number {\n\treturn a + b;\n}\n");
			await fs.writeFile(clonePath(ctx, "README.md"), "# Tutorial Clone\n\nPi Academy hands-on workspace.\n");
			await fs.writeFile(clonePath(ctx, "package.json"), JSON.stringify({ name: "pi-academy-workspace", version: "0.1.0", type: "module", scripts: { test: "echo test", build: "echo build", lint: "echo lint" } }, null, 2) + "\n");
			await ctx.exec("git", ["init"], { cwd: ctx.cloneDir }).catch(() => {});
			await ctx.exec("git", ["add", "."], { cwd: ctx.cloneDir }).catch(() => {});
			await ctx.exec("git", ["-c", "user.email=academy@pi.dev", "-c", "user.name=Pi Academy", "commit", "-m", "initial academy workspace"], { cwd: ctx.cloneDir }).catch(() => {});
			await fs.rm(ctx.referenceDir, { recursive: true, force: true }).catch(() => {});
			if (process.env.PI_ACADEMY_SKIP_REFERENCE_CLONE !== "1") {
				void ctx.exec("git", ["clone", "--depth", "1", "https://github.com/earendil-works/pi-mono.git", "pi-reference"], { cwd: ctx.cwd }).catch(() => null);
			}
		},
	},
	{
		level: 2,
		phase: "1부 · 안전한 시작",
		title: "세션 관리와 시간 여행",
		description: "pi -c, pi -r, /session, /tree, /fork, /clone, /compact의 쓰임을 구분합니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_2_COMPLETE",
		missionGuide:
			"미션 2: 세션 명령어 퀴즈\n\n" +
			"Pi 세션은 JSONL 트리 구조입니다. 한 세션 안에서 과거 지점으로 이동하고 다른 가지를 이어갈 수 있습니다.\n\n" +
			"Q. 현재 세션의 대화 트리를 열고 과거 지점으로 이동해 새 흐름을 이어갈 때 가장 먼저 쓰는 명령어는 무엇일까요?\n\n" +
			"정답을 /tutorial /tree 형태로 제출하세요.",
		unlockMessage: "🎉 2단계 통과! /tree가 세션 시간 여행의 중심이라는 점을 익혔습니다. 이제 프로젝트 지침 파일을 만듭니다.",
		async verify(ctx) {
			const answer = ctx.args.trim().toLowerCase();
			if (!answer) return false;
			if (answer === "/tree" || answer === "tree") return true;
			return { success: false, errorReason: `입력 '${answer}'은 오답입니다. 세션 트리 탐색 명령을 떠올려 보세요.` };
		},
		recoveryGuide(reason) {
			return reason ?? "정답을 /tutorial /tree 형태로 제출하세요.";
		},
	},
	{
		level: 3,
		phase: "2부 · 프로젝트 지식 주입",
		title: "AGENTS.md 프로젝트 지침",
		description: "프로젝트 개요, 명령어, 코딩 규칙, 테스트 규칙을 AGENTS.md로 고정합니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_3_COMPLETE",
		missionGuide:
			"미션 3: tutorial-clone/AGENTS.md 작성\n\n" +
			"AGENTS.md는 pi가 시작할 때 읽는 프로젝트 지침입니다. 다음 섹션을 포함해 작성하세요.\n\n" +
			"- Overview\n- Commands\n- Coding Rules\n- Testing Rules\n- Git Rules\n\n" +
			"Commands에는 Test, Build, Lint 명령을 적어 주세요.",
		unlockMessage: "🎉 3단계 통과! 프로젝트별 작업 규칙을 AGENTS.md로 주입했습니다. 다음은 반복 프롬프트를 명령으로 만드는 prompt templates입니다.",
		async verify(ctx) {
			const content = await readText(clonePath(ctx, "AGENTS.md"));
			if (!content) return false;
			const required = ["Overview", "Commands", "Coding Rules", "Testing Rules", "Git Rules", "Test", "Build", "Lint"];
			const missing = required.filter(x => !content.includes(x));
			if (missing.length === 0) return true;
			return { success: false, errorReason: `AGENTS.md에 다음 항목이 부족합니다: ${missing.join(", ")}` };
		},
		recoveryGuide(reason) {
			return `미션 3 검증 실패\n\n${reason ?? "tutorial-clone/AGENTS.md가 아직 준비되지 않았습니다."}`;
		},
	},
	{
		level: 4,
		phase: "2부 · 프로젝트 지식 주입",
		title: "Prompt Templates",
		description: "반복 프롬프트를 .pi/prompts/*.md 파일로 저장하고 /review, /fix 같은 명령으로 재사용합니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_4_COMPLETE",
		missionGuide:
			"미션 4: prompt template 두 개 만들기\n\n" +
			"아래 파일을 작성하세요.\n" +
			"- tutorial-clone/.pi/prompts/review.md: Bugs, Security, Performance, Tests 관점 포함\n" +
			"- tutorial-clone/.pi/prompts/fix.md: 최소 변경, 검증 결과 요약 지침 포함\n\n" +
			"작성 후 /reload 하면 대화형 pi에서 /review, /fix 명령으로 확장됩니다.",
		unlockMessage: "🎉 4단계 통과! 반복 프롬프트를 프로젝트 명령으로 만들었습니다. 다음은 더 구조적인 작업 절차인 Skills입니다.",
		async verify(ctx) {
			const review = await readText(clonePath(ctx, ".pi", "prompts", "review.md"));
			const fix = await readText(clonePath(ctx, ".pi", "prompts", "fix.md"));
			const reviewOk = hasAll(review, ["Security", "Performance", "Tests"]);
			const fixOk = !!fix && (fix.includes("minimal") || fix.includes("최소")) && (fix.includes("verification") || fix.includes("검증"));
			if (reviewOk && fixOk) return true;
			return { success: false, errorReason: "review.md에는 Security/Performance/Tests, fix.md에는 minimal 또는 최소, verification 또는 검증 지침이 필요합니다." };
		},
		recoveryGuide(reason) {
			return `미션 4 검증 실패\n\n${reason ?? "prompt template 파일을 확인하세요."}`;
		},
	},
	{
		level: 5,
		phase: "2부 · 프로젝트 지식 주입",
		title: "Agent Skills",
		description: "SKILL.md frontmatter와 단계별 절차를 갖춘 on-demand 능력 패키지를 만듭니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_5_COMPLETE",
		missionGuide:
			"미션 5: code-review skill 만들기\n\n" +
			"경로: tutorial-clone/.pi/skills/code-review/SKILL.md\n\n" +
			"필수 frontmatter:\n---\nname: code-review\ndescription: ...\n---\n\n" +
			"본문에는 Steps, Output, Rules 섹션을 포함하세요. Skill은 /skill:code-review 로 강제 실행할 수 있습니다.",
		unlockMessage: "🎉 5단계 통과! 유효한 Skill 패키지를 만들었습니다. 다음은 settings.json과 안전 실행 모드입니다.",
		async verify(ctx) {
			const content = await readText(clonePath(ctx, ".pi", "skills", "code-review", "SKILL.md"));
			if (!content) return false;
			const fm = parseFrontmatter(content);
			const name = fm.get("name");
			const desc = fm.get("description");
			if (name === "code-review" && !!desc && hasAll(content, ["Steps", "Output", "Rules"])) return true;
			return { success: false, errorReason: "SKILL.md에는 name: code-review, description, Steps/Output/Rules 섹션이 필요합니다." };
		},
		recoveryGuide(reason) {
			return `미션 5 검증 실패\n\n${reason ?? "SKILL.md 구조를 다시 확인하세요."}`;
		},
	},
	{
		level: 6,
		phase: "3부 · 안전 설정과 확장",
		title: "Settings와 안전한 실행 모드",
		description: "프로젝트 settings.json, compaction, skill commands, sessionDir와 read-only 실행 패턴을 익힙니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_6_COMPLETE",
		missionGuide:
			"미션 6: tutorial-clone/.pi/settings.json 작성\n\n" +
			"다음 프로젝트 설정을 포함하세요.\n" +
			"- sessionDir: .pi/sessions\n- enableSkillCommands: true\n- compaction.enabled: true\n\n" +
			"참고: defaultProjectTrust는 글로벌 설정 전용입니다. 프로젝트 설정에는 넣지 마세요.\n" +
			"그리고 안전 분석 명령을 기억하세요: pi --tools read,grep,find,ls -p \"분석해줘\"",
		unlockMessage: "🎉 6단계 통과! 안전한 프로젝트 설정을 만들었습니다. 다음은 TypeScript extension으로 pi 동작을 확장합니다.",
		async verify(ctx) {
			const settings = await readJson(clonePath(ctx, ".pi", "settings.json"));
			if (!settings) return false;
			if (settings.sessionDir === ".pi/sessions" && settings.enableSkillCommands === true && settings.compaction?.enabled === true) return true;
			return { success: false, errorReason: "settings.json에 sessionDir=.pi/sessions, enableSkillCommands=true, compaction.enabled=true가 필요합니다." };
		},
		recoveryGuide(reason) {
			return `미션 6 검증 실패\n\n${reason ?? "settings.json 값을 확인하세요."}`;
		},
	},
	{
		level: 7,
		phase: "3부 · 안전 설정과 확장",
		title: "Extensions 입문",
		description: "registerCommand와 tool_call 훅으로 /hello 명령과 위험 bash 차단 permission gate를 만듭니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_7_COMPLETE",
		missionGuide:
			"미션 7: permission-gate extension 만들기\n\n" +
			"경로: tutorial-clone/.pi/extensions/permission-gate.ts\n\n" +
			"요건:\n" +
			"- pi.registerCommand(\"hello\", ...) 포함\n" +
			"- pi.on(\"tool_call\", ...) 포함\n" +
			"- bash 명령 중 rm -rf 같은 위험 패턴을 확인/차단하는 로직 포함\n\n" +
			"프로젝트 extension은 trust된 프로젝트에서만 로드됩니다.",
		unlockMessage: "🎉 7단계 통과! 커스텀 명령과 도구 실행 전 차단 훅을 만들었습니다. 다음은 이를 패키지로 묶어 공유합니다.",
		async verify(ctx) {
			const content = await readText(clonePath(ctx, ".pi", "extensions", "permission-gate.ts"));
			if (hasAll(content, ["registerCommand", "hello", "tool_call", "bash", "rm -rf"])) return true;
			return { success: false, errorReason: "permission-gate.ts에 registerCommand, hello, tool_call, bash, rm -rf 로직이 모두 보여야 합니다." };
		},
		recoveryGuide(reason) {
			return `미션 7 검증 실패\n\n${reason ?? "extension 파일 내용을 확인하세요."}`;
		},
	},
	{
		level: 8,
		phase: "4부 · 공유와 통합",
		title: "Pi Package 만들기",
		description: "extensions, skills, prompts를 package.json의 pi manifest로 묶고 프로젝트 한정 설치 개념을 익힙니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_8_COMPLETE",
		missionGuide:
			"미션 8: tutorial-clone을 pi package로 선언\n\n" +
			"package.json에 다음을 반영하세요.\n" +
			"- keywords에 pi-package 포함\n" +
			"- pi.extensions: [\".pi/extensions\"]\n" +
			"- pi.skills: [\".pi/skills\"]\n" +
			"- pi.prompts: [\".pi/prompts\"]\n\n" +
			"프로젝트 한정 설치는 pi install -l ./path 로 합니다.",
		unlockMessage: "🎉 8단계 통과! pi package manifest를 만들었습니다. 다음은 SDK와 RPC로 pi를 앱에서 사용하는 법입니다.",
		async verify(ctx) {
			const pkg = await readJson(clonePath(ctx, "package.json"));
			if (!pkg) return false;
			const hasKeyword = Array.isArray(pkg.keywords) && pkg.keywords.includes("pi-package");
			const pi = pkg.pi ?? {};
			if (hasKeyword && Array.isArray(pi.extensions) && Array.isArray(pi.skills) && Array.isArray(pi.prompts)) return true;
			return { success: false, errorReason: "package.json에 keywords: [pi-package] 및 pi.extensions/pi.skills/pi.prompts 배열이 필요합니다." };
		},
		recoveryGuide(reason) {
			return `미션 8 검증 실패\n\n${reason ?? "package.json pi manifest를 확인하세요."}`;
		},
	},
	{
		level: 9,
		phase: "4부 · 공유와 통합",
		title: "SDK와 RPC",
		description: "Node SDK(createAgentSession)와 언어 독립 RPC(pi --mode rpc)의 선택 기준과 최소 예제를 문서화합니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_9_COMPLETE",
		missionGuide:
			"미션 9: SDK/RPC 통합 노트 작성\n\n" +
			"경로: tutorial-clone/docs/integration.md\n\n" +
			"다음을 모두 포함하세요.\n" +
			"- createAgentSession SDK 예시 또는 설명\n" +
			"- session.subscribe 이벤트 스트리밍 설명\n" +
			"- pi --mode rpc 실행 예시\n" +
			"- JSONL 또는 prompt/get_state 같은 RPC 명령 예시\n\n" +
			"Node 내부 통합은 SDK, 다른 언어/프로세스 격리는 RPC가 적합합니다.",
		unlockMessage: "🎉 9단계 통과! SDK와 RPC 통합 기준을 정리했습니다. 마지막은 전체 워크플로를 하나의 운영 문서로 묶는 것입니다.",
		async verify(ctx) {
			const content = await readText(clonePath(ctx, "docs", "integration.md"));
			if (hasAll(content, ["createAgentSession", "session.subscribe", "pi --mode rpc", "JSONL"])) return true;
			return { success: false, errorReason: "integration.md에 createAgentSession, session.subscribe, pi --mode rpc, JSONL 설명이 필요합니다." };
		},
		recoveryGuide(reason) {
			return `미션 9 검증 실패\n\n${reason ?? "docs/integration.md 내용을 확인하세요."}`;
		},
	},
	{
		level: 10,
		phase: "4부 · 공유와 통합",
		title: "실전 워크플로 졸업",
		description: "AGENTS, prompts, skills, extensions, settings, package, SDK/RPC를 일상 작업 루틴으로 통합합니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_10_COMPLETE",
		missionGuide:
			"미션 10: WORKFLOW.md 작성 및 졸업 커밋\n\n" +
			"경로: tutorial-clone/WORKFLOW.md\n\n" +
			"문서에 다음 키워드/개념을 모두 포함하세요.\n" +
			"- AGENTS.md\n- prompts\n- skills\n- extensions\n- read-only\n- /compact\n- pi install -l\n\n" +
			"마지막으로 tutorial-clone에서 git add -A && git commit -m \"complete pi academy workflow\" 를 수행하세요.",
		unlockMessage:
			"🏆🎓 PI ACADEMY 전 과정 수료! 🎓🏆\n\n" +
			"이제 pi를 단순 채팅 도구가 아니라 프로젝트 지침, 재사용 프롬프트, Skill, Extension, Package, SDK/RPC까지 조합하는 커스터마이징 가능한 AI coding harness로 운영할 수 있습니다.",
		async verify(ctx) {
			const workflow = await readText(clonePath(ctx, "WORKFLOW.md"));
			const hasDoc = hasAll(workflow, ["AGENTS.md", "prompts", "skills", "extensions", "read-only", "/compact", "pi install -l"]);
			const log = await ctx.exec("git", ["log", "--oneline"], { cwd: ctx.cloneDir }).catch(() => null);
			const commits = log && log.code === 0 ? log.stdout.trim().split("\n").filter(Boolean) : [];
			if (hasDoc && commits.length >= 2) return true;
			const missing: string[] = [];
			if (!hasDoc) missing.push("WORKFLOW.md 필수 키워드");
			if (commits.length < 2) missing.push("졸업 커밋");
			return { success: false, errorReason: `아직 다음이 부족합니다: ${missing.join(", ")}` };
		},
		recoveryGuide(reason) {
			return `미션 10 검증 실패\n\n${reason ?? "WORKFLOW.md와 졸업 커밋을 확인하세요."}`;
		},
	},
];

// Pi 아카데미 — 8단계 통합 마스터 코스 선언적 레지스트리
//
// 각 단계는 CourseStep 계약 객체다. 단계를 늘리려면 이 배열에 객체 하나만 슬라이딩
// 인젝션하면 되고, 구동기(index.ts) 코드는 일절 건드리지 않는다.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import type { AcademyContext, CourseStep } from "./types";

// ── 무손상 디스크 검사 헬퍼 ────────────────────────────────────────────────
/** 파일 내용(utf-8). 없으면 null. verify 에서 안정적으로 사용하는 헬퍼. */
async function readText(p: string): Promise<string | null> {
	return fs.readFile(p, "utf-8").catch(() => null);
}

/** 아주 단순한 YAML frontmatter 파서. `---` 로 감싼 블록의 `key: value` 라인만 추출한다.
 *  중첩/리스트 문법은 무시하되, `key:` 형태로 선언된 키의 존재 자체는 감지한다. */
function parseFrontmatter(text: string): { has: (key: string) => boolean; get: (key: string) => string | undefined } {
	const map = new Map<string, string>();
	const keys = new Set<string>();
	const trimmed = text.replace(/^\uFEFF/, "");
	if (trimmed.startsWith("---")) {
		const end = trimmed.indexOf("\n---", 3);
		if (end !== -1) {
			const block = trimmed.slice(3, end);
			for (const rawLine of block.split("\n")) {
				const line = rawLine.replace(/\s+$/, "");
				// 최상위 키만 (선행 공백 없는 라인). 리스트 아이템("- ")은 건너뛴다.
				const m = /^([A-Za-z0-9_-]+)\s*:(.*)$/.exec(line);
				if (m) {
					const key = m[1];
					keys.add(key);
					map.set(key, m[2].trim());
				}
			}
		}
	}
	return {
		has: (key: string) => keys.has(key),
		get: (key: string) => {
			const v = map.get(key);
			if (v === undefined || v === "") return undefined;
			return v.replace(/^["']|["']$/g, "");
		},
	};
}

/** 실습 저장소 내부 경로 조립기. */
function clonePath(ctx: AcademyContext, ...parts: string[]): string {
	return path.join(ctx.cloneDir, ...parts);
}

const GLOBAL_YOLO_STATE_PATH = path.join(homedir(), ".pi", "agent", "yolo-state.json");

/** 상태 파일에서 직접 approvalMode 를 로드하는 비동기 헬퍼 */
async function getApprovalMode(cwd: string): Promise<string> {
	try {
		const raw = await fs.readFile(GLOBAL_YOLO_STATE_PATH, "utf-8");
		const parsed = JSON.parse(raw) as { approvalMode?: string };
		return parsed.approvalMode ?? "yolo";
	} catch {
		return "yolo";
	}
}

// ── 8단계 코스 정의 ─────────────────────────────────────────────────────────

export const PI_MASTER_COURSE: readonly CourseStep[] = [
	// ── 1단계 ──────────────────────────────────────────────────────────────
	{
		level: 1,
		phase: "1부 · 보안 및 기본 설정",
		title: "Project Trust & Always-Ask 승인 통제",
		description: "프로젝트 신뢰(/trust) 보안 경계와 커스텀 Always-Ask 도구 승인 가두리(/yolo)를 체득합니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_1_COMPLETE",
		missionGuide:
			"미션 1: 프로젝트 신뢰 승인 및 Always-Ask 격리막 가동하기\n\n" +
			"Pi는 안전한 실행을 위해 프로젝트 로컬 리소스를 읽기 전 'Project Trust' 검문을 수행합니다.\n\n" +
			"1. 먼저 TUI 창에서 [ /trust ] 명령을 입력하여 현재 아카데미 작업 공간을 신뢰 상태로 등록해 주세요.\n" +
			"2. 그 다음, 에이전트의 임의 도구 실행에 제동을 걸기 위해 [ /yolo ] 명령을 실행하여 승인 모드를 'always-ask' 상태로 전환해 주세요.\n\n" +
			"두 가지 조치를 완료한 후 /tutorial 을 다시 실행하면 실제 세션 설정을 검문하여 채점합니다!",
		unlockMessage:
			"🎉 1단계 통과! 프로젝트 신뢰를 획득하고 커스텀 Always-Ask 도구 승인 통제막을 완벽하게 켰습니다.\n\n" +
			"📂 실습용 깃 저장소(tutorial-clone)가 즉시 로컬에서 생성되었고, 최신 Pi 코드베이스 참조 저장소는 " +
			"백그라운드에서 안전하게 다운로드 중입니다.\n\n" +
			"2단계는 세션 분기(/fork)와 TUI 시간 여행(/tree)입니다. 튜터의 실시간 가이드를 따라가 보세요!",
		async verify(ctx) {
			if (!ctx.isProjectTrusted()) {
				return { success: false, errorReason: "프로젝트가 아직 신뢰(Trust) 상태가 아닙니다. TUI 창에서 '/trust'를 실행해 현재 작업 디렉터리를 신뢰해 주세요." };
			}
			const mode = await getApprovalMode(ctx.cwd);
			if (mode === "always-ask") return true;
			if (mode === "yolo" || mode === undefined) return false;
			return { success: false, errorReason: `현재 승인 모드가 '${mode}'입니다. '/yolo'를 입력해 'always-ask' 모드로 전환해 주세요.` };
		},
		recoveryGuide(reason) {
			return (
				"미션 1 검증 실패\n\n" +
				`${reason ?? "프로젝트 신뢰 획득 및 yolo 모드 해제(always-ask 적용)가 완료되지 않았습니다."}\n\n` +
				"1. TUI 창에서 [ /trust ] 를 실행해 프로젝트 폴더를 신뢰합니다.\n" +
				"2. TUI 창에서 [ /yolo ] 를 실행해 승인 모드를 'always-ask'로 전환합니다.\n" +
				"3. 완료 후 '/tutorial'을 다시 실행하세요."
			);
		},
		async onComplete(ctx) {
			// 1) 학생 로컬 실습 저장소를 즉시(오프라인) 스캐폴딩한다.
			const loggerDir = clonePath(ctx, "packages", "utils", "src");
			await fs.rm(ctx.cloneDir, { recursive: true, force: true }).catch(() => {});
			await fs.mkdir(loggerDir, { recursive: true });

			const sampleLogger =
				`import * as fs from "node:fs";\n\n` +
				`export function ensureDir(dir: string): void {\n` +
				`\tif (!fs.existsSync(dir)) {\n` +
				`\t\tfs.mkdirSync(dir, { recursive: true });\n` +
				`\t}\n` +
				`}\n`;
			await fs.writeFile(path.join(loggerDir, "logger.ts"), sampleLogger);

			const samplePackageJson = JSON.stringify({ name: "pi-monorepo", version: "1.0.0" }, null, 2);
			await fs.writeFile(clonePath(ctx, "package.json"), samplePackageJson + "\n");

			// 로컬 git 저장소로 초기화·커밋하여 세션 분기/커밋 로그 실습이 가능하게 한다.
			await ctx.exec("git", ["init"], { cwd: ctx.cloneDir }).catch(() => {});
			await ctx.exec("git", ["add", "."], { cwd: ctx.cloneDir }).catch(() => {});
			await ctx
				.exec("git", ["-c", "user.email=academy@pi.dev", "-c", "user.name=Pi Academy", "commit", "-m", "initial commit"], {
					cwd: ctx.cloneDir,
				})
				.catch(() => {});

			// 2) Pi 참조 저장소를 백그라운드에서 클론한다(블로킹/실패 무해).
			await fs.rm(ctx.referenceDir, { recursive: true, force: true }).catch(() => {});
			void ctx.exec("git", ["clone", "--depth", "1", "https://github.com/badlogic/pi-mono.git", "pi-reference"], { cwd: ctx.cwd });
		},
	},

	// ── 2단계 ──────────────────────────────────────────────────────────────
	{
		level: 2,
		phase: "1부 · 보안 및 기본 설정",
		title: "세션 분기 및 TUI 시간 여행",
		description: "`/fork`·`/clone`·`/tree` 시간 여행 도구와 `--continue` 복구를 손으로 익힙니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_2_COMPLETE",
		missionGuide:
			"미션 2: 세션 분기 및 시간 여행 명령어 퀴즈\n\n" +
			"Pi 세션은 추가 전용(Append-only) 트리 구조입니다.\n\n" +
			"■ [ /fork ] : 현재 지점의 독립 새 세션을 생성하여 갈아탑니다.\n" +
			"■ [ /tree ] : 지금까지 이어온 전체 대화의 역사를 ASCII 트리로 구경합니다.\n" +
			"■ [ /branch ] : 과거의 특정 대화 지점을 선택해 그 시점부터 다시 새로운 대화를 시작(롤백)합니다.\n\n" +
			"Q. 과거의 특정 대화 지점으로 시간 여행을 떠나, 그 시점부터 새로운 대화 줄기를 개시할 때 사용하는 명령어는 무엇일까요?\n\n" +
			"정답을 [ /tutorial 정답 ] 형태로 입력하여 채점받으세요! (예: /tutorial /branch)",
		unlockMessage:
			"🎉 2단계 통과! 시간 여행 명령어 [ /branch ] 의 핵심 가치를 완벽히 정복하셨습니다.\n\n" +
			"3단계는 라인 한정 독해(Read Selector)와 [ Esc ] 비상 제동, 그리고 정밀 수술(Surgical Edit)입니다.",
		async verify(ctx) {
			const answer = ctx.args.trim().toLowerCase();
			if (!answer) return false; // 아직 아무것도 입력하지 않음
			if (answer === "/branch" || answer === "branch") {
				return true; // 정답!
			}
			return { success: false, errorReason: `입력하신 대답 '${answer}'은 오답입니다. 본문 가이드를 다시 읽고 정답을 입력해 보세요.` };
		},
		recoveryGuide(errorReason) {
			if (errorReason) return errorReason;
			return (
				"미션 2 대기 중\n\n" +
				"정답을 아시겠다면 [ /tutorial [정답] ] 형태로 다시 입력해 주세요!"
			);
		},
	},

	// ── 3단계 ──────────────────────────────────────────────────────────────
	{
		level: 3,
		phase: "1부 · 보안 및 기본 설정",
		title: "Read Selector & Abort 긴급 제동",
		description: "라인 한정 독해와 [ Esc ] 비상 제동 피드백, 그리고 승인 보호막 아래 정밀 수술.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_3_COMPLETE",
		missionGuide:
			"미션 3: 안전 보호막 아래 정밀 수술(Surgical Edit) 집도하기\n\n" +
			"[ tutorial-clone/packages/utils/src/logger.ts ] 의 ensureDir 함수에서 [ if (!fs.existsSync(dir)) ] 검문 블록을 깔끔하게 들어내 주세요.\n\n" +
			"직접 편집하셔도 되고, 저(에이전트)에게 지시하셔도 됩니다. 1단계에서 'always-ask'를 켰기 때문에 저에게 시키면 도구 승인 요청 팝업이 뜨며 대기합니다. 그때 엔터(Approve)로 제 손을 움직여 보세요! (취소하면 긴급 제동도 체험됩니다.)\n\n" +
			"수정 후 '/tutorial'을 다시 실행해 채점받으세요!",
		unlockMessage:
			"🎉 3단계 통과! 정밀 수술과 Always-Ask 승인 보호막 흐름을 완주했습니다.\n\n" +
			"이제 2부(지식 확장 및 프롬프트 튜닝)로 진입합니다. 4단계는 Agent Skills 지식 이식입니다.",
		async verify(ctx) {
			const loggerPath = clonePath(ctx, "packages", "utils", "src", "logger.ts");
			const content = await readText(loggerPath);
			if (content === null) {
				return { success: false, errorReason: "logger.ts 파일이 유실되었습니다. `/tutorial reset` 후 처음부터 다시 진행해야 할 수 있습니다." };
			}
			if (!content.includes("fs.existsSync(dir)")) return true;
			return false;
		},
		recoveryGuide(reason) {
			return (
				"미션 3 대기 중\n\n" +
				`${reason ?? "아직 fs.existsSync(dir) 검문 블록이 남아 있습니다."}\n\n` +
				"[ tutorial-clone/packages/utils/src/logger.ts ] 에서 해당 조건문을 제거한 뒤 '/tutorial'을 다시 실행하세요."
			);
		},
	},

	// ── 4단계 ──────────────────────────────────────────────────────────────
	{
		level: 4,
		phase: "2부 · 지식 확장 및 프롬프트 튜닝",
		title: "Agent Skills 지식 이식 & 단축 제출",
		description: "`clean-architecture/SKILL.md` 구축과 [ Ctrl+Enter ] 후속 큐 제출.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_4_COMPLETE",
		missionGuide:
			"미션 4: Agent Skill 지식 팩 이식하기\n\n" +
			"Skill 은 SKILL.md 한 장으로 에이전트에게 재사용 가능한 도메인 지식을 주입하는 파일 기반 능력 팩입니다.\n\n" +
			"아래 경로에 새 스킬을 작성하세요:\n" +
			"  경로: [ tutorial-clone/skills/clean-architecture/SKILL.md ]\n" +
			"  frontmatter 필수 키: name, description, alwaysApply: true\n\n" +
			"작성 후 '/tutorial'을 실행해 채점받으세요! (여러 줄 입력은 [ Ctrl+Enter ] 후속 큐 제출도 활용해 보세요.)",
		unlockMessage:
			"🎉 4단계 통과! Agent Skill 프로토콜을 정확히 이식했습니다.\n\n" +
			"5단계는 시스템 프롬프트 확장(APPEND_SYSTEM.md)과 TUI 컴팩션( /compact, Ctrl+O )입니다.",
		async verify(ctx) {
			const skillPath = clonePath(ctx, "skills", "clean-architecture", "SKILL.md");
			const altSkillPath = clonePath(ctx, ".pi", "skills", "clean-architecture", "SKILL.md");
			let content = await readText(skillPath);
			if (content === null) {
				content = await readText(altSkillPath);
			}
			if (content === null) return false;
			const fm = parseFrontmatter(content);
			const missing: string[] = [];
			if (!fm.get("name")) missing.push("name");
			if (!fm.get("description")) missing.push("description");
			const always = fm.get("alwaysApply");
			if (always !== "true") missing.push("alwaysApply: true");
			if (missing.length === 0) return true;
			return { success: false, errorReason: `SKILL.md frontmatter에 다음이 누락/오류입니다: ${missing.join(", ")}` };
		},
		recoveryGuide(reason) {
			return (
				"미션 4 검증 실패\n\n" +
				`${reason ?? "SKILL.md가 아직 없거나 frontmatter가 불완전합니다."}\n\n` +
				"[ tutorial-clone/skills/clean-architecture/SKILL.md ] 를 만들고, frontmatter( --- 블록)에 " +
				"name, description, alwaysApply: true 를 선언한 뒤 '/tutorial'을 다시 실행해 주세요."
			);
		},
	},

	// ── 5단계 ──────────────────────────────────────────────────────────────
	{
		level: 5,
		phase: "2부 · 지식 확장 및 프롬프트 튜닝",
		title: "시스템 프롬프트 튜닝 & 컨텍스트 컴팩션",
		description: "`.pi/APPEND_SYSTEM.md` 프롬프트 미세조정, 요약 압축 [ /compact ] 및 [ Ctrl+O ] 확장.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_5_COMPLETE",
		missionGuide:
			"미션 5: APPEND_SYSTEM.md 프롬프트 튜닝하기\n\n" +
			"Pi는 기본 시스템 프롬프트를 훼손하지 않고 확장할 수 있도록 [ .pi/APPEND_SYSTEM.md ] 파일을 자동으로 인젝션합니다.\n\n" +
			"아래 경로에 프롬프트 지침 파일을 작성해 주세요:\n" +
			"  경로: [ tutorial-clone/.pi/APPEND_SYSTEM.md ]\n" +
			"  내용: 자유로운 에이전트 보강용 한 줄 지침 기입 (예: \"한국어로 명료하게 대답하세요.\")\n\n" +
			"작성 후 '/tutorial'을 실행해 채점받으세요! ( [ /compact ] 로 컨텍스트를 압축하고 [ Ctrl+O ] 로 요약을 펼쳐 볼 수 있습니다.)",
		unlockMessage:
			"🎉 5단계 통과! APPEND_SYSTEM.md 프롬프트 확장 방식과 컴팩션 흐름을 마스터했습니다.\n\n" +
			"6단계는 백그라운드 셸 실행 및 [ ! ], [ !! ] 셸 통합 제어입니다.",
		async verify(ctx) {
			const appendSystemPath = clonePath(ctx, ".pi", "APPEND_SYSTEM.md");
			const content = await readText(appendSystemPath);
			if (content === null) return false;
			if (content.trim().length > 0) return true;
			return { success: false, errorReason: "APPEND_SYSTEM.md 파일은 있으나 내용이 비어 있습니다." };
		},
		recoveryGuide(reason) {
			return (
				"미션 5 검증 실패\n\n" +
				`${reason ?? "APPEND_SYSTEM.md 파일이 아직 없거나 불완전합니다."}\n\n` +
				"[ tutorial-clone/.pi/APPEND_SYSTEM.md ] 를 만들고 자유로운 지침을 적은 뒤 '/tutorial'을 다시 실행하세요."
			);
		},
	},

	// ── 6단계 ──────────────────────────────────────────────────────────────
	{
		level: 6,
		phase: "2부 · 지식 확장 및 프롬프트 튜닝",
		title: "백그라운드 셸 실행 & 숨김 명령 (!, !! & Background)",
		description: "[ !command ](출력을 모델로 전달) 및 [ !!command ](TUI-only 로컬 실행) 통합 셸을 배웁니다.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_6_COMPLETE",
		missionGuide:
			"미션 6: 셸 통합 명령어로 에이전트 빌드하기\n\n" +
			"Pi는 터미널을 나가지 않고 셸을 병렬 통합 실행합니다.\n\n" +
			"■ [ !command ] 는 명령 출력을 대화 기록에 전달하여 에이전트가 그 결과를 읽고 코딩할 수 있게 돕습니다.\n" +
			"■ [ !!command ] 는 로컬 전용으로 실행만 수행하고 대화 기록에는 채우지 않아 토큰을 절약합니다.\n\n" +
			"이번 미션에서는 저에게 이렇게 지시해 보세요:\n" +
			'  "tutorial-clone/packages/utils/src/parser.ts 를 생성하고 JSON.parse 를 쓰는 parseConfig 함수를 작성해줘"\n\n' +
			"작성이 완료되면 '/tutorial'을 실행해 채점받으세요!",
		unlockMessage:
			"🎉 6단계 통과! 셸 통합 실행을 활용해 파서 모듈을 성공적으로 구축했습니다.\n\n" +
			"드디어 3부(커스텀 확장과 배포)입니다. 7단계는 사내 플러그인 패키징과 매니페스트 통합입니다.",
		async verify(ctx) {
			const parserPath = clonePath(ctx, "packages", "utils", "src", "parser.ts");
			const content = await readText(parserPath);
			if (content === null) return false;
			if (content.includes("parse")) return true;
			return { success: false, errorReason: "parser.ts는 있으나 파서 로직(parse 또는 JSON.parse)을 찾지 못했습니다." };
		},
		recoveryGuide(reason) {
			return (
				"미션 6 검증 실패\n\n" +
				`${reason ?? "parser.ts가 아직 없습니다."}\n\n` +
				"[ tutorial-clone/packages/utils/src/parser.ts ] 에 parseConfig (JSON.parse 활용) 함수가 작성되도록 지시하거나 직접 작성한 뒤 '/tutorial'을 다시 실행하세요."
			);
		},
	},

	// ── 7단계 ──────────────────────────────────────────────────────────────
	{
		level: 7,
		phase: "3부 · 커스텀 확장과 배포",
		title: "사내 패키징 및 매니페스트 통합",
		description: "`package.json` Pi 전용 매니페스트 통합과 `pi config` 로컬 리소스 관리.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_7_COMPLETE",
		missionGuide:
			"미션 7: 실습 저장소를 Pi 플러그인으로 패키징하기\n\n" +
			"Pi 플러그인은 package.json 의 [ pi ] 키 하위 [ extensions ] 배열로 익스텐션 진입점을 선언합니다.\n\n" +
			"[ tutorial-clone/package.json ] 을 열어 아래와 같은 규격으로 매니페스트 정보를 추가해 주세요:\n\n" +
			"  {\n" +
			"    ...,\n" +
			"    \"pi\": {\n" +
			"      \"extensions\": [\"./index.ts\"]\n" +
			"    }\n" +
			"  }\n\n" +
			"그리고 진입점 [ tutorial-clone/index.ts ] 도 (빈 파일이라도) 만들어 두세요.\n\n" +
			"작성 후 '/tutorial'을 실행해 채점받으세요!",
		unlockMessage:
			"🎉 7단계 통과! Pi 플러그인 매니페스트 규격을 정확히 통합했습니다.\n\n" +
			"마지막 8단계는 커스텀 메시지 렌더러 등록 및 최종 졸업입니다!",
		async verify(ctx) {
			const pkgPath = clonePath(ctx, "package.json");
			const content = await readText(pkgPath);
			if (content === null) return false;
			let pkg: unknown;
			try {
				pkg = JSON.parse(content);
			} catch {
				return { success: false, errorReason: "package.json이 유효한 JSON이 아닙니다. 문법 오류를 확인하세요." };
			}
			const manifest = pkg as { pi?: { extensions?: unknown }; omp?: { extensions?: unknown } };
			const exts = manifest.pi?.extensions ?? manifest.omp?.extensions;
			if (Array.isArray(exts) && exts.some(e => typeof e === "string" && e.includes("index.ts"))) {
				return true;
			}
			return { success: false, errorReason: "`pi.extensions` 배열에 `./index.ts` 진입점이 선언되지 않았습니다." };
		},
		recoveryGuide(reason) {
			return (
				"미션 7 검증 실패\n\n" +
				`${reason ?? "package.json에 Pi 매니페스트 정보가 없습니다."}\n\n` +
				"[ tutorial-clone/package.json ] 에 \"pi\": { \"extensions\": [\"./index.ts\"] } 를 추가한 뒤 '/tutorial'을 다시 실행하세요."
			);
		},
	},

	// ── 8단계 ──────────────────────────────────────────────────────────────
	{
		level: 8,
		phase: "3부 · 커스텀 확장과 배포",
		title: "커스텀 메시지 렌더러 등록 및 최종 졸업",
		description: "`pi.registerMessageRenderer` 커스텀 뷰 등록 및 최종 배포 락 깃 커밋.",
		statusEvent: "PI_ACADEMY_STATUS: LEVEL_8_COMPLETE",
		missionGuide:
			"미션 8: 배포 커밋 & 렌더러 등록으로 졸업하기\n\n" +
			"최종 졸업 관문으로 아래의 두 가지 요건을 충족해 주세요:\n\n" +
			"  1) [ tutorial-clone ] 에서 패키징 결과를 git 커밋하세요. (예: git add -A && git commit -m \"package as pi plugin\")\n" +
			"  2) [ tutorial-clone/index.ts ] 에 커스텀 메시지 렌더러 등록 API( registerMessageRenderer )를 한 줄이라도 구현하세요.\n\n" +
			"완성 후 '/tutorial'을 실행해 최종 졸업 채점을 받으세요!",
		unlockMessage:
			"🏆🎓 PI ACADEMY 전 과정 수료! 🎓🏆\n\n" +
			"1부 보안/설정 -> 2부 지식 확장/프롬프트 튜닝 -> 3부 커스텀 확장/배포 까지, Pi의 모든 아키텍처를 손으로 " +
			"완전 정복하셨습니다. 이제 pi-reference/ 의 실제 코어 소스에 대해 무엇이든 튜터에게 물어보세요!",
		async verify(ctx) {
			// (1) 초기 커밋 이후 추가 커밋이 있는지 (패키징 흔적).
			const log = await ctx.exec("git", ["log", "--oneline"], { cwd: ctx.cloneDir }).catch(() => null);
			const commits = log && log.code === 0 ? log.stdout.trim().split("\n").filter(Boolean) : [];
			const hasPackagingCommit = commits.length >= 2;
			// (2) 익스텐션 진입점에 렌더러 등록 API가 적재되었는지 (정적 검증).
			const indexContent = await readText(clonePath(ctx, "index.ts"));
			const hasRenderer = !!indexContent && indexContent.includes("registerMessageRenderer");

			if (hasPackagingCommit && hasRenderer) return true;
			const missing: string[] = [];
			if (!hasPackagingCommit) missing.push("패키징 후속 git 커밋(2개 이상)");
			if (!hasRenderer) missing.push("index.ts 내 registerMessageRenderer 등록");
			return { success: false, errorReason: `아직 다음이 확인되지 않습니다: ${missing.join(", ")}` };
		},
		recoveryGuide(reason) {
			return (
				"미션 8 대기 중\n\n" +
				`${reason ?? "졸업 조건이 아직 충족되지 않았습니다."}\n\n` +
				"1. [ tutorial-clone ] 에서 패키징 결과를 git 커밋하고,\n" +
				"2. [ tutorial-clone/index.ts ] 에 registerMessageRenderer 호출을 넣은 뒤 '/tutorial'을 다시 실행하세요."
			);
		},
	},
];

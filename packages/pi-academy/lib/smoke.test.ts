// 스모크 테스트: 실제 course.ts 를 임포트해 레지스트리 무결성과 8개 verify 채점기를
// (미시도 → 성공) 두 상태로 임시 워크스페이스에서 실행해 로드+로직을 종단 검증한다.
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { PI_MASTER_COURSE } from "./course";
import type { AcademyContext } from "./types";

let root: string;
let ctx: AcademyContext;

async function realExec(command: string, args: string[], options?: { cwd?: string }) {
	const proc = Bun.spawn([command, ...args], { cwd: options?.cwd ?? root, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	const code = await proc.exited;
	return { stdout, stderr, code };
}

let approvalMode = "yolo";
let projectTrusted = false;

beforeAll(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-academy-smoke-"));
	ctx = {
		cwd: root,
		cloneDir: path.join(root, "tutorial-clone"),
		referenceDir: path.join(root, "pi-reference"),
		tutorDir: path.join(root, "tutor-session"),
		isProjectTrusted: () => projectTrusted,
		exec: realExec,
		settingsGet: key => undefined,
		args: "",
	};
	await fs.mkdir(ctx.tutorDir!, { recursive: true });
	await fs.writeFile(path.join(ctx.tutorDir!, "pi-tutor.jsonl"), "{}\n");

	// statePath 에 초기 상태 파일 세팅
	const statePath = path.join(root, ".pi-academy.json");
	await fs.writeFile(statePath, JSON.stringify({ currentLevel: 1, startCwd: root, approvalMode: "yolo" }, null, 2) + "\n");
});

afterAll(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

describe("registry integrity", () => {
	test("has exactly 8 steps with aligned levels", () => {
		expect(PI_MASTER_COURSE.length).toBe(8);
		PI_MASTER_COURSE.forEach((s, i) => expect(s.level).toBe(i + 1));
	});
	test("each step declares required contract fields", () => {
		for (const s of PI_MASTER_COURSE) {
			expect(s.title.length).toBeGreaterThan(0);
			expect(s.missionGuide.length).toBeGreaterThan(0);
			expect(s.unlockMessage.length).toBeGreaterThan(0);
			expect(s.statusEvent).toBe(`PI_ACADEMY_STATUS: LEVEL_${s.level}_COMPLETE`);
			expect(typeof s.verify).toBe("function");
			expect(typeof s.recoveryGuide).toBe("function");
		}
	});
	test("recoveryGuide never throws and returns non-empty string", () => {
		for (const s of PI_MASTER_COURSE) {
			expect(s.recoveryGuide("reason").length).toBeGreaterThan(0);
			expect(s.recoveryGuide(undefined).length).toBeGreaterThan(0);
		}
	});
});

// 단계별 헬퍼: 성공 상태를 디스크에 조성한다.
async function makeStepPass(level: number) {
	const c = (...p: string[]) => path.join(ctx.cloneDir, ...p);
	if (level === 1) {
		projectTrusted = true;
		approvalMode = "always-ask";
		// .pi-academy.json 에 반영
		const statePath = path.join(root, ".pi-academy.json");
		await fs.writeFile(statePath, JSON.stringify({ currentLevel: 1, startCwd: root, approvalMode: "always-ask" }, null, 2) + "\n");
	} else if (level === 2) {
		ctx.args = "/branch";
	} else if (level === 3) {
		await fs.mkdir(c("packages", "utils", "src"), { recursive: true });
		await fs.writeFile(c("packages", "utils", "src", "logger.ts"), "export function ensureDir(d){ fs.mkdirSync(d); }\n");
	} else if (level === 4) {
		await fs.mkdir(c("skills", "clean-architecture"), { recursive: true });
		await fs.writeFile(
			c("skills", "clean-architecture", "SKILL.md"),
			"---\nname: clean-architecture\ndescription: layers\nalwaysApply: true\n---\nbody\n",
		);
	} else if (level === 5) {
		await fs.mkdir(c(".pi"), { recursive: true });
		await fs.writeFile(c(".pi", "APPEND_SYSTEM.md"), "Be polite and clear in Korean.\n");
	} else if (level === 6) {
		await fs.mkdir(c("packages", "utils", "src"), { recursive: true });
		await fs.writeFile(c("packages", "utils", "src", "parser.ts"), "export const parseConfig = s => JSON.parse(s);\n");
	} else if (level === 7) {
		await fs.writeFile(c("package.json"), JSON.stringify({ name: "x", pi: { extensions: ["./index.ts"] } }, null, 2));
	} else if (level === 8) {
		await fs.writeFile(c("index.ts"), 'pi.registerMessageRenderer("x", () => "y");\n');
		await realExec("git", ["add", "-A"], { cwd: ctx.cloneDir });
		await realExec("git", ["-c", "user.email=a@b.c", "-c", "user.name=t", "commit", "-m", "package"], { cwd: ctx.cloneDir });
	}
}

describe("verify gating: not-attempted then success", () => {
	// 각 단계는 이전 단계의 onComplete 부수효과에 의존하므로 순차 실행한다.
	for (const step of PI_MASTER_COURSE) {
		test(`level ${step.level} — ${step.title}`, async () => {
			// 미시도 상태: false(가이드) 또는 오답 객체여야 하고, 절대 true 가 아니어야 한다.
			const before = await step.verify(ctx);
			expect(before).not.toBe(true);

			// 성공 상태 조성 후 통과.
			await makeStepPass(step.level);
			const after = await step.verify(ctx);
			expect(after).toBe(true);

			// 통과 부수효과(다음 단계 스캐폴딩 등) 실행.
			if (step.onComplete) await step.onComplete(ctx);
		});
	}
});

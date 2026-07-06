// 스모크 테스트: 실제 course.ts 를 임포트해 레지스트리 무결성과 verify 채점기를
// (미시도 → 성공) 두 상태로 임시 워크스페이스에서 실행해 로드+로직을 종단 검증한다.
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { PI_MASTER_COURSE } from "./course";
import type { AcademyContext } from "./types";

let root: string;
let ctx: AcademyContext;
let projectTrusted = false;

async function realExec(command: string, args: string[], options?: { cwd?: string }) {
	const proc = Bun.spawn([command, ...args], { cwd: options?.cwd ?? root, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	const code = await proc.exited;
	return { stdout, stderr, code };
}

beforeAll(async () => {
	process.env.PI_ACADEMY_SKIP_REFERENCE_CLONE = "1";
	root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-academy-smoke-"));
	ctx = {
		cwd: root,
		cloneDir: path.join(root, "tutorial-clone"),
		referenceDir: path.join(root, "pi-reference"),
		isProjectTrusted: () => projectTrusted,
		exec: realExec,
		args: "",
	};
});

afterAll(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

describe("registry integrity", () => {
	test("has exactly 10 steps with aligned levels", () => {
		expect(PI_MASTER_COURSE.length).toBe(10);
		PI_MASTER_COURSE.forEach((s, i) => expect(s.level).toBe(i + 1));
	});
	test("each step declares required contract fields", () => {
		for (const s of PI_MASTER_COURSE) {
			expect(s.title.length).toBeGreaterThan(0);
			expect(s.description.length).toBeGreaterThan(0);
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

async function makeStepPass(level: number) {
	const c = (...p: string[]) => path.join(ctx.cloneDir, ...p);
	if (level === 1) {
		projectTrusted = true;
	} else if (level === 2) {
		ctx.args = "/tree";
	} else if (level === 3) {
		await fs.writeFile(c("AGENTS.md"), "# Project Instructions\n\n## Overview\nDemo\n\n## Commands\n- Test: npm test\n- Build: npm run build\n- Lint: npm run lint\n\n## Coding Rules\n- Minimal changes\n\n## Testing Rules\n- Run tests\n\n## Git Rules\n- Do not commit unless asked\n");
	} else if (level === 4) {
		await fs.mkdir(c(".pi", "prompts"), { recursive: true });
		await fs.writeFile(c(".pi", "prompts", "review.md"), "Review. Security Performance Tests\n");
		await fs.writeFile(c(".pi", "prompts", "fix.md"), "Fix with minimal change and report verification.\n");
	} else if (level === 5) {
		await fs.mkdir(c(".pi", "skills", "code-review"), { recursive: true });
		await fs.writeFile(c(".pi", "skills", "code-review", "SKILL.md"), "---\nname: code-review\ndescription: Reviews code for correctness and security.\n---\n# Code Review\n\n## Steps\nRead files.\n\n## Output\nKorean.\n\n## Rules\nDo not edit unless asked.\n");
	} else if (level === 6) {
		await fs.mkdir(c(".pi"), { recursive: true });
		await fs.writeFile(c(".pi", "settings.json"), JSON.stringify({ sessionDir: ".pi/sessions", enableSkillCommands: true, compaction: { enabled: true } }, null, 2) + "\n");
	} else if (level === 7) {
		await fs.mkdir(c(".pi", "extensions"), { recursive: true });
		await fs.writeFile(c(".pi", "extensions", "permission-gate.ts"), "export default function(pi){ pi.registerCommand('hello', {handler(){}}); pi.on('tool_call', (event)=>{ if(event.toolName === 'bash' && event.input.command.includes('rm -rf')) return {block:true}; }); }\n");
	} else if (level === 8) {
		const pkg = JSON.parse(await fs.readFile(c("package.json"), "utf-8"));
		pkg.keywords = ["pi-package"];
		pkg.pi = { extensions: [".pi/extensions"], skills: [".pi/skills"], prompts: [".pi/prompts"] };
		await fs.writeFile(c("package.json"), JSON.stringify(pkg, null, 2) + "\n");
	} else if (level === 9) {
		await fs.mkdir(c("docs"), { recursive: true });
		await fs.writeFile(c("docs", "integration.md"), "# Integration\n\nSDK uses createAgentSession and session.subscribe for events.\n\nRPC: pi --mode rpc uses JSONL records.\n");
	} else if (level === 10) {
		await fs.writeFile(c("WORKFLOW.md"), "Use AGENTS.md, prompts, skills, extensions, read-only mode, /compact, and pi install -l for project packages.\n");
		await realExec("git", ["add", "-A"], { cwd: ctx.cloneDir });
		await realExec("git", ["-c", "user.email=a@b.c", "-c", "user.name=t", "commit", "-m", "complete pi academy workflow"], { cwd: ctx.cloneDir });
	}
}

describe("verify gating: not-attempted then success", () => {
	for (const step of PI_MASTER_COURSE) {
		test(`level ${step.level} — ${step.title}`, async () => {
			ctx.args = "";
			const before = await step.verify(ctx);
			expect(before).not.toBe(true);

			await makeStepPass(step.level);
			const after = await step.verify(ctx);
			expect(after).toBe(true);

			if (step.onComplete) await step.onComplete(ctx);
		});
	}
});

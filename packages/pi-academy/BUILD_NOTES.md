# BUILD_NOTES.md — pi-academy 빌드/유지보수 노트 (자기 완결)

이 문서는 **다른(더 저렴한) AI가 이 플러그인을 디버깅·확장할 때** 참조하도록 쓰였습니다.
`README.md`(사용자 관점)와 짝을 이루는 **개발자 관점** 문서입니다. 이 두 파일만 읽으면
코드베이스를 열지 않고도 구조·계약·검증 방법·알려진 함정을 전부 파악할 수 있어야 합니다.

> 대상 런타임: **pi 1.0.0+** (오늘 기준 설치본). 아래 API 시그니처는 Pi 코어 소스
> (`pi-reference/`, 문서 기준 SDK 타입)로 대조 검증했습니다.

---

## 0. 한 문단 요약

`/tutorial` 슬래시 명령 하나로 구동되는 대화형 8단계 Pi 학습 플러그인. 각 단계는
독립 계약 객체(`CourseStep`)이고, 8개가 읽기 전용 배열(`PI_MASTER_COURSE`)로 선언되어
있다. 얇은 구동기(`index.ts`)가 "현재 단계의 `verify`를 실행 → 통과면 잠금 해제 팝업 +
부수효과(`onComplete`) + 튜터에게 백그라운드 이벤트 전송 + 진급, 실패면 미션/교정 팝업"
루프만 돈다. `/yolo` 명령어는 승인 보호막 상태를 상호 전환하고, `tool_call` 이벤트를 가로채어
`always-ask` 조건에서 사용자에게 명시적으로 승인 팝업(`ctx.ui.confirm`)을 띄워 제어한다.
진척도는 `<cwd>/.pi-academy.json`에 영속된다. 튜터(`agents/tutor.md`)는 별도 서브 에이전트
세션으로, `PI_ACADEMY_STATUS` 이벤트를 받아 한국어로 다음 단계를 안내한다.

---

## 1. 파일 맵 (무엇이 어디에)

```
pi-academy/
  index.ts            # 구동기(driver). 도메인 지식 없음. 여기만 런타임 진입점.
  lib/
    types.ts          # CourseStep / VerifyResult / AcademyContext / AcademyState 타입
    course.ts         # PI_MASTER_COURSE 배열 + 무손상 디스크 헬퍼 + frontmatter 파서
    smoke.test.ts     # bun test 하네스 (레지스트리 무결성 + 8개 verify 종단 검증)
  agents/tutor.md     # 튜터 서브 에이전트 프롬프트 (frontmatter + 시스템 프롬프트)
  package.json        # pi.extensions 매니페스트. 진입점은 ["./index.ts"]만.
  README.md           # 사용자 관점 문서
  BUILD_NOTES.md      # (이 파일) 개발자 관점 문서
  SHARE.md            # 플러그인 배포 및 공유 가이드
```

### ⚠️ 왜 구현이 `lib/`에 있나 (가장 중요한 함정)

Pi의 익스텐션 스캐너는 **익스텐션 디렉터리의 모든 직속 `*.ts` 파일을 각각
익스텐션 팩토리로 임포트**하려 시도한다. `package.json`의 `pi.extensions: ["./index.ts"]`
선언은 이 형제-파일 스캔을 **억제하지 못한다**. 따라서 `course.ts`/`types.ts`/`smoke.test.ts`가
패키지 루트에 있으면, 각각 "Extension does not export a valid factory function" 로드 에러를
낸다 (기능은 동작하지만 로그가 지저분하고 혼란을 준다).

**해결**: 구동기가 아닌 모듈은 전부 `lib/`(하위 디렉터리, `index.ts`/`package.json` 없음)에
둔다. 스캐너는 하위 디렉터리를 index/manifest 기준으로만 처리하므로 `lib/`의 내용을 무시한다.

> **불변식**: `pi-academy/` 루트에 `.ts` 파일은 오직 `index.ts` 하나. 새 모듈은 반드시
> `lib/`에 만들고 `index.ts`에서 `./lib/...`로 임포트할 것.

---

## 2. 핵심 계약 (`lib/types.ts`)

```typescript
export type VerifyResult = boolean | { success: false; errorReason: string };
```
- `true`  → 통과.
- `false` → **아직 시도 안 함** → `missionGuide`(과제 안내) 팝업.
- `{ success:false, errorReason }` → **시도했으나 오답** → `recoveryGuide(errorReason)` 팝업.

이 3-way 구분이 UX의 핵심이다. verify를 새로 쓸 때:
- 파일/설정이 아예 없다 = 아직 안 함 = `return false`.
- 파일은 있는데 내용이 틀렸다 = 오답 = `return { success:false, errorReason:"…" }`.

```typescript
export interface CourseStep {
  level: number;            // 1-based. 배열 인덱스+1 과 반드시 일치.
  phase: string;            // 진척도 UI 그룹 표기 ("1부 · …")
  title: string;
  description: string;
  missionGuide: string;     // 미시도 시 팝업 본문
  unlockMessage: string;    // 통과 시 팝업 본문 (첫 줄은 notify 토스트로도 재사용됨)
  statusEvent: string;      // "PI_ACADEMY_STATUS: LEVEL_<n>_COMPLETE"
  verify: (ctx: AcademyContext) => Promise<VerifyResult>;
  recoveryGuide: (errorReason?: string) => string;
  onComplete?: (ctx: AcademyContext) => Promise<void>;  // 통과 직후 부수효과
}
```

`AcademyContext`는 `ExtensionCommandContext`의 **축약 어댑터**다. verify/onComplete를
순수하게(=실제 익스텐션 런타임 없이) 테스트할 수 있도록 최소 표면만 노출한다:
```typescript
interface AcademyContext {
  cwd: string;
  cloneDir: string;         // <cwd>/tutorial-clone
  referenceDir: string;     // <cwd>/pi-reference
  tutorDir: string | null;  // pi-tutor.jsonl 이 있는 디렉터리 (세션 분기 탐지용)
  isProjectTrusted(): boolean;
  exec(command, args, options?): Promise<{ stdout; stderr; code }>;
  settingsGet(key: string): unknown;   // settings.get 위임
}
```

`AcademyState` (= `.pi-academy.json` 스키마):
```typescript
interface AcademyState {
  currentLevel: number;
  startCwd: string | null;
  approvalMode: "always-ask" | "yolo";
}
```
- `currentLevel`: 1..8 진행 중, `9`(= N+1)이면 졸업.
- `startCwd`: 학습 시작 경로 락. 다른 경로에서 `/tutorial` 실행 시 차단.
- `approvalMode`: `/yolo` 명령어로 전환되는 도구 승인 모드.

---

## 3. 구동기 흐름 (`index.ts`)

`pi.registerCommand("tutorial", …)` 핸들러 한 개와 `/yolo` 핸들러, 그리고 `tool_call` 수신기가 핵심. 순서:

1. `.pi-academy.json` 로드 (`loadState`). 손상 시 기본값으로 초기화.
2. 인자 분기:
   - `reset` → 튜터 세션 파일 + `tutorial-clone/` + `pi-reference/` + 상태파일 삭제.
   - `status` → 현재 단계/졸업 알림.
3. 경로 락: `startCwd` 최초 설정·저장, 이후 `ctx.cwd !== startCwd`면 차단.
4. 튜터 세션 활성화: 현재 세션이 `pi-tutor.jsonl`이 아니면 `activateTutorSession`이
   `agents/tutor.md`의 frontmatter를 잘라 `systemPrompt`로 하는 `session_init` 엔트리를 만들고
   `ctx.switchSession(...)`으로 전환. (전환 후 사용자에게 "다시 `/tutorial`" 안내.)
5. 1단계 최초 진입 시 빈 디렉터리 권장 검사(`isAcademyArtifact`로 산출물 제외).
6. `pi.setActiveTools(TUTOR_TOOLS)`로 튜터 세션 도구 제한.
7. **`runVerifyLoop`** — 핵심:
   - `buildAcademyContext`로 `ExtensionCommandContext` → `AcademyContext` 어댑트.
   - `step.verify(academyCtx)` 실행.
   - `=== true`: `unlockMessage` 첫 줄 토스트 → `onComplete` → `currentLevel++` 저장 →
     `pi.sendMessage({customType:"pi-academy-status", content:step.statusEvent, display:false},
     {deliverAs:"steer", triggerTurn:false})` → 졸업이면 수료 팝업, 아니면 다음 단계
     `unlockMessage + 다음.missionGuide` 팝업.
   - `=== false`: `missionGuide` 팝업.
   - 오답 객체: `recoveryGuide(errorReason)` 팝업.

---

## 4. 검증 방법

### 4-1. 스모크 테스트 (기능)
```bash
cd ~/.pi/agent/extensions/pi-academy
bun test lib/smoke.test.ts
```
`lib/smoke.test.ts`는 실제 `course.ts`를 임포트해 (a) 레지스트리 무결성(8단계, level 정렬,
statusEvent 규칙, recoveryGuide 비throw), (b) 각 verify를 임시 워크스페이스에서 미시도→성공
두 상태로 순차 실행하며 통과 게이팅을 검증한다.

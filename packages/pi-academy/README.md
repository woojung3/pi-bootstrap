# Pi 아카데미 (pi-academy)

Pi(pi-coding-agent)를 단순히 실행하는 수준을 넘어, **프로젝트 지침·프롬프트·스킬·확장·패키지·SDK/RPC까지 조합해 나만의 AI coding harness로 운영하는 법**을 배우는 한국어 실전 튜토리얼 extension입니다.

`/tutorial` 명령 하나로 튜터 세션을 열고, `tutorial-clone/` 실습 저장소에 실제 파일을 만들며 단계별로 채점받습니다.

## 무엇을 배우나

| 부 | 단계 | 주제 | 산출물 |
|---|---:|---|---|
| 1부 · 안전한 시작 | 1 | Project Trust와 안전한 시작 | `tutorial-clone/` |
| | 2 | 세션 관리와 시간 여행 | `/tree` 퀴즈 |
| 2부 · 프로젝트 지식 주입 | 3 | `AGENTS.md` 프로젝트 지침 | `AGENTS.md` |
| | 4 | Prompt Templates | `.pi/prompts/review.md`, `fix.md` |
| | 5 | Agent Skills | `.pi/skills/code-review/SKILL.md` |
| 3부 · 안전 설정과 확장 | 6 | Settings와 안전 실행 모드 | `.pi/settings.json` |
| | 7 | Extensions 입문 | `.pi/extensions/permission-gate.ts` |
| 4부 · 공유와 통합 | 8 | Pi Package 만들기 | `package.json`의 `pi` manifest |
| | 9 | SDK와 RPC | `docs/integration.md` |
| | 10 | 실전 워크플로 졸업 | `WORKFLOW.md` + git commit |

## 핵심 철학

이 아카데미는 “명령어 암기”보다 다음 운영 패턴을 익히는 데 초점을 둡니다.

- 신뢰하지 않는 프로젝트는 `-na`와 `--tools read,grep,find,ls`로 먼저 읽기 전용 분석
- 프로젝트 규칙은 `AGENTS.md`에 고정
- 반복 프롬프트는 `.pi/prompts/`로 명령화
- 절차와 도메인 지식은 `.pi/skills/*/SKILL.md`로 패키징
- 안전 정책과 UI/명령 확장은 TypeScript extension으로 구현
- 팀 공유는 pi package와 `pi install -l`로 프로젝트 한정 설치
- 앱 통합은 Node SDK, 다른 언어/프로세스 격리는 RPC 모드 선택

## 아키텍처

- `lib/types.ts` — `CourseStep` 계약 인터페이스
- `lib/course.ts` — 10단계 선언적 코스 레지스트리와 검증기
- `index.ts` — `/tutorial` 명령, 튜터 세션 전환, 채점 루프
- `tutor.md` — 한국어 튜터 세션용 시스템 프롬프트

진척도는 `<cwd>/.pi-academy.json`에 저장되어 재시작 후에도 이어집니다.

## 설치

### A안 — 사용자 extension 디렉터리에 배치

```bash
cp -r . ~/.pi/agent/extensions/pi-academy
```

Pi를 재시작한 뒤 `/tutorial`을 실행하세요.

### B안 — 1회 로드

```bash
pi --extension /path/to/pi-academy
```

## 사용

```bash
/tutorial          # 아카데미 시작 또는 현재 단계 채점
/tutorial status   # 현재 진척도 확인
/tutorial reset    # 진척도와 실습 폴더 초기화
```

> 권장: 빈 디렉터리에서 시작하세요. `/tutorial`은 시작 경로를 고정하므로 항상 같은 위치에서 진행해야 합니다.

## 온디스크 산출물

- `<cwd>/.pi-academy.json` — 진척 상태
- `<cwd>/tutorial-clone/` — 실습용 로컬 git 저장소
- `<cwd>/pi-reference/` — Pi 코어 소스 참조 클론(백그라운드, 실패해도 학습 진행 가능)

`/tutorial reset`은 위 산출물을 정리합니다.

## 보안 주의

Project-local `.pi/extensions`와 pi packages는 로컬 권한으로 코드를 실행할 수 있습니다. 신뢰하지 않는 패키지나 프로젝트 리소스는 설치·승인 전에 반드시 검토하세요.

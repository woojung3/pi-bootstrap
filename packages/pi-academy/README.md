# Pi 아카데미 (pi-academy)

Pi(pi-coding-agent)의 전 아키텍처를 **손으로 직접 조작하며** 마스터하는 대화형 8단계 실전 입문 플러그인입니다. 슬래시 명령 `/tutorial` 하나로 실습 저장소를 자동 구축하고, 각 단계를 물리 디스크 및 프로젝트 신뢰 검증으로 채점하며, 튜터 서브 에이전트가 한국어로 실시간 가이드합니다.

특히, Pi에서 기본 제공하지 않는 **Always-Ask 승인 통제 모델**을 확장 플러그인 방식으로 구현하여 `/yolo` 명령어로 도구 폭주를 통제할 수 있습니다.

## 무엇을 배우나

| 부 | 단계 | 주제 |
|---|---|---|
| 1부 · 보안 및 기본 설정 | 1 | Project Trust 및 Always-Ask 승인 통제 (`/trust`, `/yolo`) |
| | 2 | 세션 분기 & TUI 시간 여행 (`/fork`, `/tree`, `/clone`, `--continue`) |
| | 3 | Read Selector & Abort 긴급 제동 & 정밀 수술(Surgical Edit) |
| 2부 · 지식 확장 및 프롬프트 튜닝 | 4 | Agent Skills 지식 이식 (`SKILL.md`) |
| | 5 | 시스템 프롬프트 확장(APPEND_SYSTEM.md) 및 컴팩션 (`/compact`, `Ctrl+O`) |
| | 6 | 백그라운드 셸 실행 및 !, !! 명령어 제어 |
| 3부 · 커스텀 확장과 배포 | 7 | 사내 플러그인 패키징 & 매니페스트 통합 (package.json의 `"pi"` 설정) |
| | 8 | 메시지 렌더러 등록 및 최종 졸업 (`pi.registerMessageRenderer`) |

## 아키텍처

선언적 도메인 특화 레지스트리(Declarative DSL-like Step Registry)로 구현되어 있습니다.

- `types.ts` — `CourseStep` 계약 인터페이스 (`verify` 채점기 + `recoveryGuide` 교정 매뉴얼 + `onComplete` 부수효과).
- `course.ts` — 8단계를 담은 읽기 전용 `PI_MASTER_COURSE` 배열. 단계를 늘리려면 이 배열에 객체 하나만 추가하면 되고, 구동기는 건드리지 않습니다.
- `index.ts` — 도메인 지식이 없는 얇은 구동기. 공통 채점 루프(verify → 잠금 해제/부수효과/Cooperative Link 이벤트 → 진급 → 다음 미션) 및 `/yolo`와 `tool_call` 차단 필터를 가동합니다. 진척도는 `<cwd>/.pi-academy.json`에 영속되어 재시작·세션 전환 후에도 이어집니다.
- `agents/tutor.md` — 튜터 서브 에이전트 프롬프트. `PI_ACADEMY_STATUS` 백그라운드 이벤트를 받아 도구 호출 없이 즉시 다음 단계를 한국어로 안내합니다.

## 설치

### A안 — 사용자 익스텐션 디렉터리에 그대로 배치 (기본)

```bash
cp -r . ~/.pi/agent/extensions/pi-academy
```

`~/.pi/agent/extensions/` 아래의 익스텐션은 자동 발견됩니다. Pi를 재시작한 뒤 `/tutorial`을 실행하세요.

### B안 — 설정 배열 / CLI 플래그로 1회 로드

```bash
pi --extension /path/to/pi-academy
```

## 사용

```bash
/tutorial          # 아카데미 시작 / 현재 단계 채점·진행
/tutorial status   # 현재 진척도 확인
/tutorial reset    # 진척도·실습 폴더 전체 초기화
/yolo              # Always-Ask 승인 모드와 YOLO(무검문) 모드 상호 전환
```

1단계에서 프로젝트 신뢰를 획득하고 `/yolo` 모드를 `always-ask`로 바꾸면 실습 저장소 `tutorial-clone/`이 즉시 생성되고, 최신 Pi 코어 참조본 `pi-reference/`가 백그라운드로 클론됩니다. 이후 각 단계 미션을 마치고 `/tutorial`을 다시 실행하면 채점됩니다.

> **권장**: 빈 디렉터리에서 시작하세요. `/tutorial`은 시작 경로를 고정(락)하므로 항상 같은 위치에서 실행해야 합니다.

## 온디스크 산출물

- `<cwd>/.pi-academy.json` — 진척 상태(현재 단계, 시작 경로, 승인 모드).
- `<cwd>/tutorial-clone/` — 실습용 로컬 git 저장소.
- `<cwd>/pi-reference/` — Pi 코어 소스 참조 클론(질답용).

`/tutorial reset`이 위 세 가지와 튜터 세션 파일을 모두 정리합니다.

# pi-academy BUILD_NOTES

## 개요

`pi-academy`는 `/tutorial` 슬래시 명령으로 구동되는 대화형 10단계 Pi 학습 extension입니다. 학생은 `tutorial-clone/` 실습 저장소에 실제 파일을 만들고, 각 단계의 `verify()` 채점기가 디스크 상태와 명령 인자를 확인합니다.

## 현재 코스 구성

1. Project Trust와 실습 저장소 준비
2. 세션 관리와 `/tree` 시간 여행
3. `AGENTS.md` 프로젝트 지침
4. `.pi/prompts/` Prompt Templates
5. `.pi/skills/*/SKILL.md` Agent Skills
6. `.pi/settings.json`과 안전 실행 모드
7. `.pi/extensions/` TypeScript Extensions
8. Pi Package manifest와 `pi install -l`
9. SDK/RPC 통합 노트
10. 실전 `WORKFLOW.md`와 졸업 커밋

## 주요 파일

- `index.ts` — `/tutorial` 명령, 튜터 세션 전환, 공통 채점 루프
- `lib/course.ts` — 선언적 `PI_MASTER_COURSE` 레지스트리와 단계별 `verify()`
- `lib/types.ts` — `AcademyContext`, `CourseStep`, `AcademyState` 계약
- `tutor.md` — `PI_ACADEMY_STATUS` 이벤트에 반응하는 한국어 튜터 세션용 시스템 프롬프트
- `lib/smoke.test.ts` — 레지스트리 무결성과 각 단계 검증기 스모크 테스트

## 설계 메모

- 구동기(`index.ts`)는 단계 내용을 모릅니다. 현재 단계 객체의 `verify → onComplete → statusEvent`만 실행합니다.
- 단계 추가/수정은 기본적으로 `lib/course.ts` 레지스트리 객체만 고치면 됩니다.
- 튜터는 학생 파일을 대신 만들지 않습니다. `/tutorial` 채점 결과만 신뢰합니다.
- 프로젝트 로컬 `.pi/extensions`와 package는 trust 후 실행된다는 보안 모델을 학습 내용에 포함합니다.
- 테스트에서는 `PI_ACADEMY_SKIP_REFERENCE_CLONE=1`로 참조 저장소 클론을 생략합니다.

## 검증

```bash
cd packages/pi-academy
bun test
```

현재 스모크 테스트는 다음을 확인합니다.

- 정확히 10개 단계가 있고 level이 배열 순서와 일치
- 모든 단계가 필수 계약 필드를 선언
- `recoveryGuide()`가 항상 유효 문자열 반환
- 각 단계가 미시도 상태에서는 통과하지 않고, 성공 산출물을 만든 뒤 통과

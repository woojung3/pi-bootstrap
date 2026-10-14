# process_content

Codemode에서 긴 문서·로그·API 응답을 요약·추출·분류·비교·재구성하는 범용 Pi 확장입니다.
입력 텍스트와 지시만 별도의 모델 호출에 전달하며, 현재 대화 이력·Skill·셸·파일·검색 도구는
전달하지 않습니다. 별도 에이전트 프로세스·Swarm·벡터 DB·서버는 없습니다.

## 사용

`exposure: codemode`로 등록되며 직접 모델 도구 목록에는 기본 노출하지 않습니다.
Codemode는 bootstrap의 기본 도구 설정으로 활성화합니다. 명시적 도구 allowlist를
사용하면 `process_content`가 제외될 수 있으므로 해당 실행의 도구 선택도 확인합니다.

```js
const response = await tools.bash({ command: "your-read-only-cli --json" });
if (response.exit_code !== 0 || response.truncated) throw new Error("Read failed or truncated");
const selected = JSON.parse(response.output); // 여기서 코드로 필요한 필드부터 선택
const result = await tools.process_content({
  content: JSON.stringify(selected),
  instruction: "결정 사항과 후속 작업만 한국어로 추출해줘",
  sources: [{ id: "doc-1", title: "제공된 문서", url: "https://example.test/doc-1" }],
  model: "gpt-6.1-sol",
  thinking: "low",
  maxOutputTokens: 2048,
  timeoutMs: 120000
});
if (!result.ok) throw new Error(result.error);
return result;
```

예시의 명령·출처는 실제 조회 결과로 바꿉니다. `content`는 문자열이며 객체는
`JSON.stringify`로 전달합니다. 경로·URL을 받더라도 읽거나 접속하지 않습니다.
원문을 먼저 직접 조회해 메인 컨텍스트에 넣은 뒤 요약해도 이미 들어간 원문은 제거되지 않습니다.
조회와 처리를 같은 Codemode 안에서 수행하고 필요한 결과만 반환하세요.

## 모델과 제한

| 항목 | 값 |
|---|---|
| 제공자 | `openai-codex`만; Pi의 기존 모델 registry·인증 사용 |
| 기본 모델 | `gpt-6.1-sol` |
| 허용 모델 | `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna` |
| Thinking | 기본 `low`, 선택 `low/medium/high` |
| 출력 토큰 한도 | 기본 2048, 256–8192; reasoning이 한도에 영향을 줄 수 있음 |
| 시간 한도 | 기본 120초, 1–180초 |
| 입력 한도 | 지시·출처·본문을 JSON 직렬화한 UTF-8 120,000바이트 |
| 지시 / 출처 | 지시 4000자, 출처 최대 100개 |
| 동시 호출 | 확장 인스턴스당 2개; 초과는 `busy`, 무제한 대기열 없음 |

모델 context window도 보수적인 바이트 기반 상한과 여유분으로 검사합니다.
큰 입력은 조용히 자르지 않고 거절합니다. 필터링·섹션 선택·분할은 호출자가 명시적으로
수행합니다. 자동 재귀·재시도·다른 제공자 fallback은 없습니다. 등록된 모델 endpoint는
사용자의 Pi provider 설정을 따르므로 허용 ID 목록은 네트워크 격리 장치가 아닙니다.

취소·시간 초과를 모델 요청에 전달합니다. 제공자가 취소를 무시해도 호출자에게는 반환하며,
해당 요청의 동시 실행 슬롯은 실제 종료까지 유지합니다. 원격 처리·과금이 즉시 중단된다는
보장은 없습니다. 정상 응답과 수신된 오류 응답의 usage는 Pi 세션 비용에 포함합니다.
응답 전에 중단되거나 제공자가 usage를 반환하지 않으면 비용을 확정할 수 없습니다.

## 결과와 오류

성공: `ok`, `provider`, `model`, `result`(문자열), `sources`, `warnings`.
출처는 입력으로 제공된 ID 중 모델이 선택한 것만 원래 metadata로 반환합니다.
JSON 형태와 ID 유효성은 검사하지만 인용이 의미상 정확한지까지 보장하지 않습니다.
원본의 버전·잘림·변환 경고는 호출자가 별도로 보존하세요. 결과는 원문 전체의 대체물이 아닙니다.

실패: `ok: false`, `error`와 제공자/모델 metadata. 원문·제공자 응답·인증값을 오류에 넣지 않습니다.
대표 오류는 `input_too_large`, `input_too_large_for_model`, `model_not_allowed`,
`model_unavailable`, `authentication_unavailable`, `busy`, `timeout`, `aborted`,
`output_limit`, `invalid_model_output`, `model_failed`입니다. 실패를 빈 요약으로 취급하지 마세요.

## 개인정보와 권한

사용자가 승인한 자료 처리에만 사용합니다. 콘텐츠는 선택된 제공자에 전송됩니다.
본문은 신뢰할 수 없는 데이터로 취급하고 내부 명령을 따르지 않도록 지시합니다.
도구를 주지 않는 것이 실행 권한 경계이며 프롬프트만으로 완전한 injection 방어가 되지는 않습니다.

확장은 원문 파일·캐시·로그를 만들지 않으며 입력을 `details`나 `onUpdate`로 보내지 않습니다.
그러나 Pi의 중첩 도구 호출 인자 기록, 다른 확장의 관찰 hook, 제공자 로그에는 내용이 남을 수
있습니다. Codemode의 `store()`는 세션에 영속화되므로 원문 보관에 사용하지 마세요.
컨텍스트 최소화와 zero-retention은 다릅니다. `exposure: codemode`도 접근 통제는 아닙니다.

## 설치·검증

루트 패키지에 포함됩니다. [설치·업데이트](../../docs/pi-install.md)를 따르고
`/reload`하거나 새 Pi 세션을 시작합니다. 기본 `openai-codex` 인증은 Pi의 `/login`에서 준비합니다.
로컬 소스를 시험할 때는 `pi --extension ./extensions/process-content/index.ts`로
명시적으로 로드하며 동일 확장을 패키지와 로컬 경로에서 중복 등록하지 않습니다.

`npm test`는 입력·모델·출처 검증, 오류, 취소, 시간·동시 호출 제한을 모의 모델로 검증합니다.
`npm run test:pi`는 실제 격리 Pi에서 production factory·Codemode exposure와 execute를
검증하되 모델 호출은 가짜 registry로 대체합니다. 실제 모델 시험은 별도 승인 범위에서만 수행합니다.

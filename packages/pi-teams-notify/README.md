# pi-teams-notify

Pi 작업이 **완전히 끝났을 때** Microsoft Teams Incoming Webhook으로 알립니다. `agent_end`가 아닌 `agent_settled` 이벤트를 사용하므로 자동 재시도, compaction 재시도, follow-up까지 모두 끝난 뒤 판단합니다.

## 설치

```bash
pi install ./packages/pi-teams-notify
```

## 권장 설정 UX

Webhook은 비밀값이므로 저장소에 직접 넣지 않습니다. 개인 전역 설정 파일을 사용하면 shell마다 환경변수를 export할 필요가 없고 권한도 `0600`으로 유지됩니다.

```bash
mkdir -p ~/.pi/agent
cp packages/pi-teams-notify/teams-notify.example.json ~/.pi/agent/teams-notify.json
chmod 600 ~/.pi/agent/teams-notify.json
$EDITOR ~/.pi/agent/teams-notify.json
```

기존 `TEAMS_WEBHOOK_URL`도 계속 지원하며 설정 파일보다 우선합니다.

## 모드와 명령

```text
/teams-notify smart    # 의미 있는 작업만 알림(권장, /teams-notify on과 동일)
/teams-notify all      # 모든 작업 알림
/teams-notify off      # 알림 끄기
/teams-notify next     # 다음 작업만 반드시 알린 뒤 이전 모드로 복귀
/teams-notify status   # 상태 및 webhook 출처 확인(URL은 표시하지 않음)
/teams-notify summary auto        # Gemini 우선, 실패 시 기계식 한 줄 요약(권장)
/teams-notify summary ai          # AI 한 줄 요약 사용(실패 시 기계식 fallback)
/teams-notify summary mechanical  # 외부 모델 호출 없이 한 줄 요약
/teams-notify summary off         # 요약문 없이 메트릭만 표시
/teams-notify test                # 테스트 메시지 전송
/teams-notify                     # 상태와 사용법 표시(설정을 변경하지 않음)
```

Smart 모드는 다음 조건을 **OR**로 평가합니다.

- 60초 이상 실행
- 10 turn 이상
- 10회 이상 도구 호출
- `goal_complete` 또는 `goal_blocked` 호출

기준은 `smart` 설정에서 변경할 수 있습니다. 기존 `{ "enabled": true }` 설정은 자동으로 Smart 모드로 읽습니다.

```json
{
  "mode": "smart",
  "webhookUrl": "https://...",
  "notifyNext": false,
  "smart": {
    "minimumDurationSeconds": 60,
    "minimumTurns": 10,
    "minimumToolCalls": 10,
    "alwaysNotifyGoalCompletion": true
  },
  "summary": {
    "mode": "auto",
    "provider": "litellm",
    "model": "gemini-3.1-flash-lite",
    "maximumLength": 140,
    "timeoutSeconds": 5
  }
}
```

## Footer

Pi의 공식 extension status API에 `🔔 smart`, `🔔 all`, `🔔 next`를 게시합니다. `@narumitw/pi-statusline`은 이를 자체 색상·separator 형식으로 렌더링합니다. 현재 statusline 플러그인은 외부 extension status를 메인 powerline과 별도의 footer line에 렌더링하므로, 다른 패키지의 footer를 덮어쓰지 않고 공식 연동 방식을 따릅니다.

## 한 줄 요약 UX

Teams 카드가 채팅을 잠식하지 않도록 기본 알림은 아래 세 요소만 표시합니다.

- 완료 또는 확인 필요 상태와 프로젝트 디렉터리명
- 요청과 최종 결과를 합친 최대 140자의 한 줄 요약
- 소요 시간과 turn/tool 수

기본 `auto` 모드는 설정된 `litellm/gemini-3.1-flash-lite` 모델과 인증을 사용할 수 있을 때 AI로 한 문장을 생성합니다. 모델 미등록, 인증 실패, 5초 timeout, 빈 응답 등 어떤 실패가 발생해도 요청 및 결과의 첫 문장을 조합한 로컬 요약으로 조용히 fallback하며 Teams 알림 자체는 계속 전송합니다. AI에 전달하는 요청과 결과는 각각 최대 4,000자로 제한됩니다.

`goal_blocked`가 호출된 작업은 `⛔ Pi 확인 필요`로 구분합니다. Webhook URL 자체는 UI나 알림에 노출하지 않습니다.

> 요약에는 요청과 응답 내용이 외부 모델로 전달될 수 있습니다. 이를 원하지 않으면 `summary.mode`를 `mechanical` 또는 `off`로 설정하세요.
>
> Teams Workflow webhook이 MessageCard를 받지 않도록 구성된 경우, Incoming Webhook 또는 MessageCard 호환 workflow를 사용하세요.

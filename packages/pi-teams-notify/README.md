# pi-teams-notify

Pi의 작업이 **완전히 끝났을 때** Microsoft Teams Incoming Webhook으로 알립니다. `agent_end`가 아닌 `agent_settled` 이벤트를 사용하므로 자동 재시도, compaction 재시도, follow-up까지 모두 끝난 뒤 한 번 전송합니다.

## 설치

```bash
pi install ./packages/pi-teams-notify
```

## 권장 설정 UX

Webhook은 비밀값이므로 저장소의 package 파일에 직접 넣지 않습니다. 개인 전역 설정 파일을 사용하면 shell마다 환경변수를 export할 필요가 없고 권한도 `0600`으로 유지됩니다.

```bash
mkdir -p ~/.pi/agent
cp packages/pi-teams-notify/teams-notify.example.json ~/.pi/agent/teams-notify.json
chmod 600 ~/.pi/agent/teams-notify.json
$EDITOR ~/.pi/agent/teams-notify.json
```

```json
{
  "enabled": false,
  "webhookUrl": "https://..."
}
```

기존 `TEAMS_WEBHOOK_URL`도 계속 지원하며, 설정 파일보다 우선합니다. 팀/프로젝트별로 URL을 바꾸거나 CI에서 주입할 때 유용합니다.

## 명령

```text
/teams-notify          # on/off 토글
/teams-notify on       # 완료 알림 켜기(재시작 후에도 유지)
/teams-notify off      # 끄기
/teams-notify status   # 상태 및 webhook 출처 확인(URL은 표시하지 않음)
/teams-notify test     # 테스트 메시지 전송
```

알림에는 프로젝트 디렉터리명, 요청과 최종 답변의 일부, 작업 경로, 소요 시간이 포함됩니다. Webhook URL 자체는 UI나 알림에 노출하지 않습니다.

> Teams Workflow webhook이 MessageCard를 받지 않도록 구성된 경우, Incoming Webhook 또는 MessageCard 호환 workflow를 사용하세요.

# Pi 설정법

## 1. 모델 설정

이 저장소의 `config/models.json`을 `~/.pi/agent/models.json`로 복사합니다.

```bash
mkdir -p ~/.pi/agent
cp config/models.json ~/.pi/agent/models.json
```

현재 모델 설정은 `litellm` provider를 OpenAI Chat Completions 호환 API로 등록합니다.

```json
{
  "providers": {
    "litellm": {
      "baseUrl": "https://aigw.autocrypt.co.kr/v1",
      "api": "openai-completions",
      "apiKey": "$LITELLM_API_KEY"
    }
  }
}
```

주의: Pi의 공식 파일명은 `models.json`입니다. 예전에 `models.yml`이라고 부르더라도 실제 적용 파일은 `~/.pi/agent/models.json`입니다.

## 2. 환경변수 / direnv

프로젝트 또는 개인 shell 설정에서 다음을 지정합니다.

```bash
export LITELLM_MASTER_KEY="..."
export LITELLM_API_KEY="$LITELLM_MASTER_KEY"
```

`direnv`를 쓴다면:

```bash
cp envrc.example .envrc
$EDITOR .envrc
direnv allow
```

`.envrc`에는 실제 secret을 직접 쓰지 않는 것을 권장합니다. secret은 shell profile, password manager, 별도 private 파일에서 주입하세요.

## 3. Statusline / Goal 설치

```bash
pi install npm:@narumitw/pi-statusline
pi install npm:@narumitw/pi-goal
```

설치 결과는 `~/.pi/agent/settings.json`의 `packages` 배열과 `~/.pi/agent/npm/` 아래에 반영됩니다.

## 4. OpenAI 모델 로그인

Pi 안에서:

```text
/login
/model
```

`/login`으로 OpenAI 계열 provider 인증을 추가한 뒤 `/model`에서 원하는 모델을 선택합니다.

## 5. 확인

```bash
pi --list-models
pi list
```

Pi 실행 중에는 `/model`을 열 때 `models.json`이 다시 로드됩니다.

# pi-bootstrap

개인용 Pi 개발 환경을 빠르게 복원하기 위한 **dotfiles/config monorepo**입니다.

- Pi 모델 설정
- 환경변수/direnv 예시
- 복원 스크립트
- 직접 개발한 Pi 패키지(`pi-yolo`, `pi-academy`, `pi-google-data-store-search`)
- 설치/설정/배포 문서

## 구조

```text
pi-bootstrap/
  README.md
  package.json                 # 이 repo 자체도 pi package로 설치 가능
  config/
    models.json                # LiteLLM/OpenAI-compatible 모델 정의(비밀키 없음)
  envrc.example                # direnv 예시
  scripts/
    bootstrap.sh               # 전체 복원
    install-pi-config.sh       # models.json만 설치
  docs/
    pi-install.md
    pi-config.md
    pi-packages.md
  packages/
    pi-academy/
    pi-google-data-store-search/ # Google Gemini Enterprise / Vertex AI Search Data Store 검색 도구
    pi-yolo/
```

## 빠른 복원

```bash
git clone https://github.com/woojung3/pi-bootstrap.git
cd pi-bootstrap
./scripts/bootstrap.sh
```

`bootstrap.sh`가 수행하는 일:

1. `config/models.json` → `~/.pi/agent/models.json` 복사
2. `npm:@narumitw/pi-statusline` 설치
3. `npm:@narumitw/pi-goal` 설치
4. `packages/pi-yolo` 로컬 설치
5. `packages/pi-academy` 로컬 설치
6. `packages/pi-google-data-store-search` 로컬 설치

그 다음 수동 단계:

```bash
export LITELLM_MASTER_KEY="..."
export LITELLM_API_KEY="$LITELLM_MASTER_KEY"
pi
```

Pi 안에서:

```text
/login
/model
```

## 패키지 설치 방식

개별 로컬 설치:

```bash
pi install ./packages/pi-yolo
pi install ./packages/pi-academy
pi install ./packages/pi-google-data-store-search
```

GitHub repo 전체를 하나의 Pi package로 설치:

```bash
pi install git:github.com/woojung3/pi-bootstrap@v0.3.0
```

루트 `package.json`이 세 extension을 함께 선언합니다.

### GitHub에서 하나만 로드하기

Pi의 `pi install` 명령은 git repo 전체를 패키지로 설치합니다. 대신 settings의 package filtering을 쓰면 같은 GitHub repo에서 원하는 extension만 로드할 수 있습니다. 이미 string form으로 설치했다면 `~/.pi/agent/settings.json`의 해당 `packages` 항목을 아래 object form으로 바꾸세요.

`pi-yolo`만 로드:

```json
{
  "packages": [
    {
      "source": "git:github.com/woojung3/pi-bootstrap@v0.3.0",
      "extensions": ["packages/pi-yolo/index.ts"]
    }
  ]
}
```

`pi-academy`만 로드:

```json
{
  "packages": [
    {
      "source": "git:github.com/woojung3/pi-bootstrap@v0.3.0",
      "extensions": ["packages/pi-academy/index.ts"]
    }
  ]
}
```

`pi-google-data-store-search`만 로드:

```json
{
  "packages": [
    {
      "source": "git:github.com/woojung3/pi-bootstrap@v0.3.0",
      "extensions": ["packages/pi-google-data-store-search/index.ts"]
    }
  ]
}
```

프로젝트 한정으로 공유하려면 같은 내용을 `.pi/settings.json`에 넣거나 `pi install -l` 후 해당 항목을 object form으로 바꾸면 됩니다.

## 현재 사용 중인 핵심 설정

- `~/.pi/agent/models.json`: LiteLLM 게이트웨이(`https://aigw.autocrypt.co.kr/v1`)를 OpenAI-compatible provider로 등록
- `.envrc`: `export LITELLM_API_KEY="$LITELLM_MASTER_KEY"`
- 설치 패키지: `pi install npm:@narumitw/pi-statusline`, `pi install npm:@narumitw/pi-goal`
- 직접 개발 패키지: `pi-yolo`, `pi-academy`, `pi-google-data-store-search`
- `pi-google-data-store-search`: Confluence/SharePoint 등 Google Data Store source를 선택해 검색하는 도구. 자세한 설정은 [`packages/pi-google-data-store-search/README.md`](packages/pi-google-data-store-search/README.md)를 참조하세요.
- OpenAI 계열 모델: Pi의 `/login`으로 인증 후 `/model`에서 선택

## 문서

- [Pi 설치법](docs/pi-install.md)
- [Pi 설정법](docs/pi-config.md)
- [Pi 패키지 배포/설치](docs/pi-packages.md)

## 보안 원칙

`auth.json`, 실제 API key, master key, token, 회사 내부 Google Cloud project ID, connector ID, Data Store ID는 절대 커밋하지 않습니다. 이 저장소에는 환경변수 참조(`$LITELLM_API_KEY`)와 공개 가능한 예시값만 저장합니다.

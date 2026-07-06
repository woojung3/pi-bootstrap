# pi-bootstrap

개인용 Pi 개발 환경을 빠르게 복원하기 위한 **dotfiles/config monorepo**입니다.

- Pi 모델 설정
- 환경변수/direnv 예시
- 복원 스크립트
- 직접 개발한 Pi 패키지(`pi-yolo`, `pi-academy`)
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
    pi-yolo/
```

## 빠른 복원

```bash
git clone git@github.com:<USER>/pi-bootstrap.git
cd pi-bootstrap
./scripts/bootstrap.sh
```

`bootstrap.sh`가 수행하는 일:

1. `config/models.json` → `~/.pi/agent/models.json` 복사
2. `npm:@narumitw/pi-statusline` 설치
3. `npm:@narumitw/pi-goal` 설치
4. `packages/pi-yolo` 로컬 설치
5. `packages/pi-academy` 로컬 설치

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
```

GitHub repo 전체를 하나의 Pi package로 설치:

```bash
pi install git:github.com:<USER>/pi-bootstrap@v0.1.0
```

루트 `package.json`이 두 extension을 함께 선언합니다.

## 현재 사용 중인 핵심 설정

- `~/.pi/agent/models.json`: LiteLLM 게이트웨이(`https://aigw.autocrypt.co.kr/v1`)를 OpenAI-compatible provider로 등록
- `.envrc`: `export LITELLM_API_KEY="$LITELLM_MASTER_KEY"`
- 설치 패키지: `pi install npm:@narumitw/pi-statusline`, `pi install npm:@narumitw/pi-goal`
- 직접 개발 패키지: `pi-yolo`, `pi-academy`
- OpenAI 계열 모델: Pi의 `/login`으로 인증 후 `/model`에서 선택

## 문서

- [Pi 설치법](docs/pi-install.md)
- [Pi 설정법](docs/pi-config.md)
- [Pi 패키지 배포/설치](docs/pi-packages.md)

## 보안 원칙

`auth.json`, 실제 API key, master key, token은 절대 커밋하지 않습니다. 이 저장소에는 환경변수 참조(`$LITELLM_API_KEY`)만 저장합니다.

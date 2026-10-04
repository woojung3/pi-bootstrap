# 설치·업데이트

## 준비

Node.js 22.19 이상, npm, Git, Python 3가 필요합니다. pi는 공식 설치 방법을 사용합니다.

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi --version
```

또는 공식 플랫폼 installer를 사용할 수 있습니다.

```sh
curl -fsSL https://pi.dev/install.sh | sh
```

프로젝트 신뢰 요청은 검토한 프로젝트에만 승인합니다.

## 개인 환경 복원

저장소 루트에서:

```sh
./scripts/bootstrap.sh
pi list
```

기본 대상은 `~/.pi/agent`입니다. `PI_AGENT_DIR`를 지정하면 모델 설정과 패키지
설치에 같은 경로를 사용합니다. bootstrap은 기존 모델 catalog를 교체하므로
개인 수정이 있다면 먼저 원본에 반영하거나 따로 보관합니다.

설치되는 패키지는 다음 네 개입니다.

- `git:github.com/woojung3/pi-bootstrap@v0.5.0`
- `npm:@narumitw/pi-statusline`
- `npm:@narumitw/pi-goal`
- `npm:@narumitw/pi-usage`

외부 npm 패키지는 버전 범위를 고정하지 않습니다. 설치 시 선택된 버전은 로컬에
설치되며 `pi update --extensions`로 갱신합니다. 자체 Git 패키지는 tag에 고정됩니다.

## 인증과 시작

장비의 secret loader로 `LITELLM_API_KEY`를 주입하거나 pi가 지원하는 provider의
로그인을 사용합니다. [환경 설정](pi-config.md)을 참고하세요.

```sh
pi
```

pi 안에서 `/login`, `/model`로 사용할 인증과 모델을 선택합니다. 이미 실행 중인
세션의 확장을 교체하려면 작업 종료 후 `/reload`하거나 새 pi 프로세스를 시작합니다.

## 업데이트

```sh
pi update                 # pi 자체
pi update --extensions    # 설치 패키지 갱신; 고정 tag는 이동하지 않음
```

자체 패키지의 새 release를 적용하려면 `pi install git:github.com/woojung3/pi-bootstrap@v<버전>`을
실행합니다. `main`이나 로컬 소스를 수정하는 것만으로 설치본이 바뀌지는 않습니다.

패키지 목록은 `pi list`, 제거는 `pi remove <source>`를 사용합니다.

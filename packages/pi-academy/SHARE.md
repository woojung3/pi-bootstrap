# Pi Packages & 팀 배포 가이드

Pi 리소스는 크게 두 방식으로 공유할 수 있습니다.

## 1. Pi Package로 공유

패키지는 `extensions`, `skills`, `prompts`, `themes`를 `package.json`의 `pi` manifest로 묶습니다.

```json
{
  "name": "my-pi-tools",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

설치 예:

```bash
pi install npm:@org/my-pi-tools
pi install git:github.com/org/my-pi-tools@v1.0.0
pi install ./local-pi-tools
```

프로젝트 한정 설치는 `-l`을 사용합니다.

```bash
pi install -l git:github.com/org/project-pi-tools@v1.0.0
```

이 경우 설정은 프로젝트의 `.pi/settings.json`에 기록되고, 패키지는 프로젝트 `.pi/npm/` 또는 `.pi/git/` 아래에 설치됩니다. 팀 저장소에 `.pi/settings.json`을 공유하면 팀원이 프로젝트를 trust한 뒤 동일한 pi 리소스를 사용할 수 있습니다.

## 2. 프로젝트 로컬 리소스로 공유

특정 프로젝트에만 필요한 리소스는 저장소 안에 직접 둘 수 있습니다.

```text
.pi/
  extensions/
  skills/
  prompts/
  themes/
  settings.json
```

이 리소스들은 프로젝트가 trust된 뒤 로드됩니다. 신뢰하지 않는 저장소에서는 실행되지 않도록 Project Trust가 안전 경계 역할을 합니다.

## 보안 원칙

- Extension은 로컬 권한으로 임의 TypeScript/JavaScript를 실행할 수 있습니다.
- Skill은 모델에게 위험한 명령 실행을 지시할 수 있습니다.
- 외부 package 설치 전 `package.json`, `extensions/`, `skills/`를 검토하세요.
- 신뢰하지 않는 프로젝트는 먼저 읽기 전용으로 분석하세요.

```bash
pi -na --tools read,grep,find,ls -p "프로젝트 구조를 분석해줘"
```

## 추천 팀 운영 방식

- 개인 공통 도구: 글로벌 `pi install npm:...` 또는 `git:...`
- 프로젝트 전용 도구: `pi install -l ...` 또는 `.pi/` 디렉터리에 직접 포함
- 안정성 필요: git package는 태그/커밋 ref로 고정
- 새 리소스 추가 후: pi 안에서 `/reload`

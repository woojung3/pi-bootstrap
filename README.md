# pi-bootstrap

개인용 **pi 환경 복원과 Google Data Store 검색 확장**을 관리합니다.
모델 설정과 설치 방법의 원본이며, 장비별 서비스나 비밀정보는 관리하지 않습니다.

## 설치 구성

| 구분 | 항목 |
|---|---|
| 자체 확장 | `pi-google-data-store-search` — Confluence·SharePoint 등 Data Store 검색 |
| 외부 패키지 | `@narumitw/pi-statusline`, `@narumitw/pi-goal`, `@narumitw/pi-usage` |
| 모델 설정 | `config/models.json` — LiteLLM 모델 catalog, API 키는 환경변수 참조 |

Herdr 연동 확장은 Herdr가 관리합니다. `find-skills`·`herdr` 스킬도 이 저장소의
배포 대상이 아닙니다. 프롬프트·테마는 별도로 번들하지 않습니다.

## 빠른 시작

[pi 설치](docs/pi-install.md)를 마친 후 실행합니다.

```sh
git clone https://github.com/woojung3/pi-bootstrap.git
cd pi-bootstrap
./scripts/bootstrap.sh
pi list
```

bootstrap은 설정을 검증한 뒤 버전이 고정된 Git 패키지와 외부 패키지를 설치합니다.
패키지 설치가 모두 성공하면 **기존 모델 catalog를 백업하고 교체**합니다. 프로젝트 `.envrc`를 만들거나
비밀값을 저장하지 않습니다. 로컬 소스 수정이 설치된 Git 패키지에 바로 반영되지는 않습니다.

확장만 설치하려면:

```sh
pi install git:github.com/woojung3/pi-bootstrap@v0.6.0
```

## 문서

- [설치·업데이트](docs/pi-install.md)
- [모델·환경 설정](docs/pi-config.md)
- [패키지 개발·배포](docs/pi-packages.md)
- [검색 인증·소스 설정](extensions/google-data-store-search/README.md)

## 검증

```sh
npm ci --ignore-scripts --omit=peer
npm test
npm run test:pi
```

`npm test`는 설치·검색 로직을 검증합니다. `test:pi`는 실제 pi를 격리 실행해
도구 등록과 오류 처리를 확인하며 외부 API를 호출하지 않습니다. 실제 모델을 사용하는
선택적 검증은 [개발·배포 문서](docs/pi-packages.md)를 참고하세요.

확장은 `extensions/<이름>/`에 독립적으로 추가하고, 루트 manifest와 lockfile을
공유합니다. 설치할 외부 패키지의 원본은 `config/packages.json`입니다.

비밀키, OAuth 인증 파일, 실제 회사 Data Store 식별자와 webhook은 Git에 넣지
않습니다. 비밀 주입은 장비의 secret loader나 별도 인증 도구가 담당합니다.

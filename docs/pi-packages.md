# 확장 개발·배포

## 여러 확장을 담는 하나의 패키지

```text
pi-bootstrap/
├── package.json             # release 버전, pi.extensions, 공유 의존성
├── package-lock.json        # 의존성 lockfile 하나
├── config/
│   ├── models.json          # 모델 catalog
│   └── packages.json        # Git 저장소와 외부 패키지 목록
├── extensions/
│   └── google-data-store-search/
│       ├── index.ts         # Pi 도구 등록·모듈 연결
│       ├── types.ts         # 확장 내부 자료형
│       ├── sources.ts       # 설정·별칭 검증, source 선택
│       ├── search.ts        # Google API 요청
│       ├── results.ts       # 결과 정규화·출력·fallback
│       ├── synthesis.ts     # 격리된 Pi 요약 subprocess
│       └── README.md
├── skills/phone-notify/      # 폰으로 원문 보내기 지침 (호스트 도구 호출)
├── scripts/                 # 설치·검증 진입점
└── tests/                   # 설치 회귀, 확장별 단위 테스트, Pi probe
```

확장은 여러 개가 될 수 있지만 운영 배포는 **버전 고정 루트 Git 패키지 하나**입니다.
확장마다 package.json·lockfile·release 버전을 복제하지 않습니다.

새 확장을 추가할 때:

1. `extensions/<이름>/index.ts`와 기능 문서를 만듭니다.
2. 루트 `pi.extensions`에 진입점만 추가합니다.
3. 외부 runtime 의존성은 루트 `dependencies`에서 관리합니다.
4. 해당 확장의 테스트를 추가합니다. 서로 다른 확장에 섣불리 공통 프레임워크를
   도입하지 말고, 실제로 공유하는 기능이 생겼을 때만 분리합니다.

Pi SDK·TypeBox는 host-provided peer로 선언하며 runtime 의존성으로 번들하지 않습니다.
다른 프로젝트에서도 독립 배포해야 하는 확장이 생기면 그때 별도 패키지로 분리합니다.

## 스킬

`skills/<이름>/SKILL.md`에 name·description frontmatter와 지침을 두고
루트 `pi.skills`로 배포합니다. 인증정보·서비스 설치는 호스트에서 관리합니다.
`phone-notify`는 로컬 전송 환경이 있으면 직접, 없으면 `jwlee@minipc`에 SSH로
접속해 `host-notify`를 호출합니다. 사용자의 명시적 전송 요청이 필요합니다.
실제 Pi RPC `get_commands` 테스트로 패키지의 스킬 발견을 검증합니다.

## 검증

```sh
npm ci --ignore-scripts --omit=peer
npm test
npm run test:pi
bash -n scripts/bootstrap.sh scripts/install-pi-config.sh
```

- `npm test`: 설치 실패 시 모델 보존, 백업, 실제 pi의 설정 경로 인식, 검색의
  source 검증·요청·결과·요약·취소 처리. Google API와 모델 API는 mock으로 대체합니다.
- `test:pi`: 실제 Pi RPC에서 production factory를 로드·등록하고, production execute
  callback의 source 오류 경로를 검증합니다. 임시 설정을 사용하며 외부 API는 호출하지 않습니다.
- `test:pi:live`: 실제 Pi subprocess와 모델 API를 사용합니다. 비용이 발생할 수 있으며
  합성 테스트 문서만 전송합니다. 실제 Google 검색 검증과는 별개입니다.

```sh
npm run test:pi:live -- <provider> <model>
```

로컬 개발본만 대화형으로 시험할 때는 설정을 바꾸지 않는 일회성 로드를 사용합니다.

```sh
pi --no-extensions --extension ./extensions/google-data-store-search/index.ts
```

검색 도구를 실행하면 실제 Google API 요청과 선택적 모델 호출이 발생합니다.

## Release

1. 루트 `package.json`의 버전과 문서의 설치 tag를 갱신합니다.
2. `npm install --package-lock-only --ignore-scripts --omit=peer` 후 검증합니다.
3. commit·push 후 같은 commit에 `v<버전>` tag를 발행합니다. 공개된 tag는 덮어쓰지 않습니다.
4. `pi install git:github.com/woojung3/pi-bootstrap@v<버전>`으로 설치본을 갱신합니다.
5. `pi list`, 설치된 manifest를 확인하고 pi를 reload하거나 재시작합니다.

bootstrap은 루트 버전에서 Git tag를 계산합니다. tag 발행 전 개발본은 위 일회성
로드로 시험합니다. `pi update --extensions`는 고정 tag를 다음 release로 옮기지 않습니다.

## 변경 원칙

설정·검색·출력의 순수 로직은 Pi API와 분리하고, 네트워크·프로세스 경계는 테스트에서
교체할 수 있게 유지합니다. 실제 계정의 비밀·문서 내용을 테스트 fixture에 넣지 않습니다.
문서는 현재 사용법을 설명하고 변경 이력은 Git에 맡깁니다.

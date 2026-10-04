# 패키지 개발·배포

## 구조와 원본

```text
pi-bootstrap/
├── config/models.json                    # 모델 catalog
├── packages/pi-google-data-store-search/ # 자체 검색 확장
├── scripts/                             # 설치·검증
├── tests/                               # 부수효과 없는 설치 테스트
└── package.json                         # 버전·Pi resource manifest
```

운영 설치는 **tag에 고정된 루트 Git 패키지 하나**로 통일합니다. 개별 확장을
로컬 경로로 중복 등록하지 않습니다. 루트 `pi.extensions`는 검색 확장만 선언합니다.

## 개발과 검증

```sh
npm ci --ignore-scripts
npm test
bash -n scripts/bootstrap.sh scripts/install-pi-config.sh
```

로컬 개발본만 시험하려면 설치 설정을 바꾸지 않는 일회성 로드를 사용합니다.

```sh
pi --no-extensions --extension ./packages/pi-google-data-store-search/index.ts
```

이 명령은 다른 확장을 끄고 검색 확장만 로드합니다. Google 검색을 실행하면 실제
API 요청과 모델 호출이 발생할 수 있습니다. 설정만 확인하는 테스트와 구분하세요.

모델 catalog는 `verify-models.py`의 계약 검사를 함께 유지합니다. 검색 확장의
설정·동작은 확장 README를 원본으로 삼고, 상위 문서에는 링크만 둡니다.

## Release

1. 루트 `package.json`의 버전을 정하고 `npm install --package-lock-only --ignore-scripts`로
   lockfile을 맞춥니다. 문서의 설치 tag도 함께 갱신합니다.
2. 테스트와 diff를 검토하고 커밋·push합니다. 비밀이나 로컬 인증 파일을 포함하지 않습니다.
3. 같은 commit에 `v<버전>` tag를 만들고 push합니다. 공개한 tag는 덮어쓰지 않습니다.
4. `pi install git:github.com/woojung3/pi-bootstrap@v<버전>`으로 설치본을 갱신합니다.
5. `pi list`와 설치된 manifest를 확인하고 세션을 reload하거나 재시작합니다.

bootstrap은 루트 `package.json`에서 버전을 읽습니다. 배포되지 않은 버전의 작업
트리에서 bootstrap을 실행하면 해당 Git tag를 찾을 수 없으므로, 개발 중에는
일회성 extension 로드를 사용합니다.

## 의존성

Git 패키지의 runtime 의존성은 Pi가 설치합니다. 로컬 개발에서는 루트의
`npm ci`를 사용합니다. SDK 등 Pi가 제공하는 패키지는 번들하지 않습니다.
외부 확장 소스, Herdr 관리 파일, 개인 스킬을 이 저장소에 복사하지 않습니다.

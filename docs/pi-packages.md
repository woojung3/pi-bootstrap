# 확장 개발·배포

## 구성

```text
pi-bootstrap/
├── package.json             # 버전·기본 Pi 리소스·공유 의존성
├── package-lock.json
├── config/                  # 모델 catalog·외부 패키지 목록
├── extensions/
│   ├── process-content/     # 기본: Codemode용 격리 콘텐츠 처리
│   └── google-data-store-search/  # 선택: 명시적 로드만 허용
├── skills/phone-notify/     # 명시적 폰 전송 지침
├── scripts/                # 설치·검증
└── tests/                  # 순수 로직·Pi 연동 테스트
```

운영 배포는 **버전 고정 루트 Git 패키지 하나**입니다. 확장마다 manifest·lockfile·release를
복제하지 않습니다. 기본 리소스는 `package.json`의 `pi` 항목이 정하며, Google Data Store
검색은 [명시적으로 로드](../extensions/google-data-store-search/README.md#설치)합니다.

확장은 `extensions/<이름>/index.ts`에 등록하고 기능 문서와 테스트를 함께 둡니다.
기본 활성화할 확장만 루트 `pi.extensions`에 추가합니다. 외부 runtime 의존성은 루트에서
관리하고 Pi SDK·TypeBox는 host-provided peer로 선언합니다.

스킬은 `skills/<이름>/SKILL.md`의 name·description과 지침으로 구성합니다.
인증정보·서비스 설치는 호스트가 소유하며, 실제 외부 전송은 사용자 요청 범위에서만 수행합니다.

## 검증

```sh
npm ci --ignore-scripts --omit=peer
npm test
npm run test:pi
bash -n scripts/bootstrap.sh scripts/install-pi-config.sh
```

- `npm test`: 설정 병합·백업·설치 실패 처리, 모델 catalog, 콘텐츠 처리의 입력·출처·모델·
  취소·시간·동시 호출 제한, 선택적 검색의 요청·결과·요약 처리. API는 가짜 응답을 사용합니다.
- `test:pi`: 격리된 실제 Pi에서 콘텐츠 처리 도구의 Codemode 노출·실행과 선택적 검색의
  명시적 등록·입력 오류 처리를 확인합니다. 모델·Google API를 호출하지 않습니다.
- `test:pi:live`: 선택적 검색 요약기의 실제 모델 시험입니다. 사용자 승인 범위에서 합성
  텍스트만 전송하며 `npm run test:pi:live -- <provider> <model>`로 실행합니다.

설정 변경 없이 로컬 확장을 시험하려면 `pi --extension ./extensions/<이름>/index.ts`를
사용합니다. 설치된 패키지와 같은 확장을 중복 로드하지 않습니다.
`process_content`의 호출 계약·권한·오류는 [확장 문서](../extensions/process-content/README.md)를 따릅니다.

## Release

1. `package.json`의 버전과 문서의 설치 tag를 갱신합니다.
2. `npm install --package-lock-only --ignore-scripts --omit=peer` 후 위 검증을 실행합니다.
3. 의도한 파일만 commit·push하고 같은 commit에 `v<버전>` tag를 발행합니다. 공개된 tag는 덮어쓰지 않습니다.
4. `pi install git:github.com/woojung3/pi-bootstrap@v<버전>`으로 설치합니다.
5. `python3 scripts/install-pi-tools.py`, `pi list`로 기본 설정·패키지를 확인한 뒤 `/reload`합니다.

bootstrap은 루트 버전에서 설치 tag를 계산합니다. `pi update --extensions`는 고정 tag를
다음 release로 옮기지 않습니다. 패키지로 전환할 때 같은 확장의 개발용 링크가 있다면
대상과 소유권을 확인한 뒤 그 링크만 제거합니다.

## 개발 경계

판정·변환은 시스템 입출력과 분리하고 네트워크·모델·프로세스 경계는 테스트에서 교체합니다.
실제 인증정보·회사 문서·개인 데이터는 fixture에 넣지 않습니다.
일반 Pi 설정과 범용 확장은 여기서, 장비별 CLI·서비스·비밀 주입은 해당 호스트 저장소에서 관리합니다.

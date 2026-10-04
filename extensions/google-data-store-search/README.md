# Google Data Store Search

`google_data_store_search`는 Google Gemini Enterprise / Vertex AI Search의
Discovery Engine API를 통해 **한 번에 한 source**를 검색합니다.
Confluence·SharePoint 커넥터 등을 이름·별칭으로 선택합니다.

## 설치

```sh
pi install git:github.com/woojung3/pi-bootstrap@v0.6.0
```

루트 Git 패키지에 포함됩니다. 같은 확장의 로컬 복사본을 추가 등록하지 않습니다.
개발·테스트 방법은 [확장 개발](../../docs/pi-packages.md)을 참고하세요.

## 인증

Google Application Default Credentials를 사용합니다.

```sh
gcloud auth application-default login
```

서비스 계정을 사용한다면 key 파일을 저장소 밖에 두고 `GOOGLE_APPLICATION_CREDENTIALS`로
참조합니다. 검색 권한은 `discoveryengine.servingConfigs.search`가 필요합니다.
조직 정책에 맞는 최소 권한을 부여하고 키나 OAuth 토큰을 Git에 넣지 않습니다.

## Source catalog

기본 파일은 `~/.config/pi/google-data-store-sources.json`입니다.

```sh
mkdir -p ~/.config/pi
cp extensions/google-data-store-search/google-data-store-sources.example.json \
  ~/.config/pi/google-data-store-sources.json
chmod 600 ~/.config/pi/google-data-store-sources.json
```

실제 project·Data Store·Engine 식별자는 이 개인 파일에 입력합니다.

```json
[
  {
    "name": "confluence-pages",
    "aliases": ["confluence", "wiki"],
    "project": "example-project",
    "dataStoreId": "example-connector_page",
    "engineId": "example-engine",
    "confluenceSpaceKey": "EXAMPLE"
  },
  {
    "name": "sharepoint-files",
    "aliases": ["sharepoint"],
    "project": "example-project",
    "dataStoreId": "example-connector_file",
    "engineId": "example-engine"
  }
]
```

설정 우선순위:

1. `GOOGLE_DATA_STORE_SOURCES_FILE`로 명시한 파일
2. 기본 개인 파일
3. `GOOGLE_DATA_STORE_SOURCES`의 JSON 배열
4. `GOOGLE_DATA_STORE_ID`로 지정한 단일 store

기본 파일이 **없는 경우에만** 다음 설정으로 넘어갑니다. JSON 오류, 읽기 권한 오류,
빈 catalog, 중복 name/alias는 오류로 처리합니다. 명시한 파일은 없어도 오류입니다.

이름과 별칭은 대소문자 구분 없이 전체 catalog에서 고유해야 합니다. 같은 source
내부에서 name을 alias로 반복하는 것은 허용합니다. 명시적 source는 정확한 이름·별칭을
우선 사용하고, 없으면 유일한 부분 일치만 허용합니다. source를 생략하면 source가
하나이거나 질문에 포함된 name/alias가 하나의 source만 가리켜야 합니다.

### Source 필드

| 필드 | 용도 |
|---|---|
| `name`, `dataStoreId` | 필수 이름과 Data Store ID |
| `aliases`, `description` | 별칭 배열과 설명 |
| `project`, `location`, `collection` | 해당 source의 Google 리소스 위치 |
| `engineId`, `engineServingConfig` | Engine 검색과 serving config |
| `servingConfig` | Engine 없이 직접 store 검색 시 serving config |
| `confluenceSpaceKey`, `confluenceSpaceName` | `space.key`, `space.name` 필터 |
| `sharepointSiteId`, `sharepointSiteName` | `parentReference.siteId`, `SiteName` 필터 |
| `filter` | 추가 Discovery Engine 필터 |

커넥터가 생성한 ID의 `_page`, `_file`, `_attachment` 등 접미사를 확인하세요.
편의 필터는 추가 filter와 AND로 결합합니다. 문자열은 인용부호를 escape합니다.
필터는 검색 조건이지 접근 제어가 아닙니다. 접근 권한은 Google IAM과 소스 권한으로
관리해야 하며 도구의 `filter` 인자는 설정된 검색 필터를 override할 수 있습니다.

## 환경변수

source별 값이 전역 환경값보다 우선합니다.

| 변수 | 기본값 / 역할 |
|---|---|
| `GOOGLE_CLOUD_PROJECT` | source에 project가 없으면 필수 |
| `GOOGLE_CLOUD_LOCATION` | `global` |
| `GOOGLE_DATA_STORE_COLLECTION` | `default_collection` |
| `GOOGLE_DISCOVERY_ENGINE_ID` | 공통 Engine ID, 선택 사항 |
| `GOOGLE_DISCOVERY_ENGINE_SERVING_CONFIG` | `default_search` |
| `GOOGLE_DATA_STORE_SERVING_CONFIG` | 직접 store 검색은 `default_config` |
| `GOOGLE_DATA_STORE_PAGE_SIZE` | 정수, 기본 5, 1–20 범위로 제한 |
| `GOOGLE_DATA_STORE_FILTER` | source/tool 필터가 없을 때 사용 |
| `GOOGLE_DATA_STORE_SOURCE` | 단일-store 설정의 이름, 기본 `default` |

Engine이 있으면 `dataStoreSpecs`로 source의 store를 한정하고 단락·표 추출을
요청합니다. Engine이 없으면 직접 store endpoint를 사용합니다. 실제 추출 범위는
데이터와 Google 서비스 설정에 따라 달라지며, 추출 단락이 없으면 snippet을 사용합니다.
질문을 임의의 사람 이름이나 업무 키워드로 확장하지 않고 입력 query로 한 번 요청합니다.

## 선택적 요약

기본적으로 검색 결과를 별도 Pi subprocess에서 현재 provider/model로 요약합니다.
모델이 없거나 비활성화하면 원문 결과를 반환합니다.

| 변수 | 용도 |
|---|---|
| `GOOGLE_DATA_STORE_SUBAGENT` | `0` 또는 `false`면 요약하지 않음 |
| `GOOGLE_DATA_STORE_SUBAGENT_PROVIDER` | 요약 provider override |
| `GOOGLE_DATA_STORE_SUBAGENT_MODEL` | 요약 model override |

요약 subprocess는 tools·extensions·skills·프로젝트 지침을 끄고 임시 디렉터리에서
실행합니다. 인증과 모델 설정은 Pi 사용자 설정을 사용하지만, 확장으로만 등록되는
provider는 이 격리 실행에서 사용할 수 없습니다. 그런 모델은 override하거나 요약을 끕니다.
실행은 최대 180초이며 취소·시간 초과 시 자식 프로세스와 임시 prompt 파일을 정리합니다.

요약 실패 시 오류 출력 대신 **모든 검색 발췌문과 URL**을 반환합니다. 사용자의 취소는
정상 응답으로 바꾸지 않습니다. 검색 결과가 없으면 요약 모델을 호출하지 않습니다.

기업 문서의 발췌문은 선택한 모델 공급자에게 전달될 수 있습니다. 조직 정책에 맞는
모델을 선택하거나 `GOOGLE_DATA_STORE_SUBAGENT=0`으로 요약을 끄세요.

## 사용

자연어로 “Confluence에서 배포 절차를 찾아줘”라고 요청하거나 도구에 다음을 전달합니다.

```json
{"query":"배포 절차","source":"confluence","pageSize":5}
```

문서 제목과 URL을 근거로 답변합니다. HTTP 오류, source 설정 오류 등은 도구 실패로
보고하며, 상세 서버 응답·모델 stderr·인증값을 오류 메시지에 포함하지 않습니다.

이 확장 코드는 MIT 라이선스입니다.

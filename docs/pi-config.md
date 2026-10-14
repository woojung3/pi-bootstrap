# 모델·환경 설정

## 모델 catalog

원본은 `config/models.json`입니다. LiteLLM을 `openai-completions` 호환 provider로
등록하고 API 키는 `$LITELLM_API_KEY`를 참조합니다. 실제 키를 JSON에 넣지 않습니다.

```sh
python3 scripts/verify-models.py
./scripts/install-pi-config.sh
pi --list-models
```

installer는 catalog를 검증한 뒤 `~/.pi/agent/models.json`을 0600 권한으로 원자적으로
교체합니다. 내용이 바뀌면 기존 파일을 설정 디렉터리의 `backups/`에 보관하며, 같으면
백업을 늘리지 않습니다. `PI_CODING_AGENT_DIR`로 대상 경로를 지정할 수 있습니다.
사용자 설정의 기본 provider/model은 변경하지 않습니다.

### Claude 5.5 Gateway 계약

`sonnet`/`haiku`는 각각 `claude-sonnet-5-5`/`claude-haiku-5-5`와 ID·표시 이름을
제외한 metadata가 같습니다. 기존 Sonnet 5·Haiku 4.5 고정 ID와 Grok 4.6은 유지하고,
Grok 4.3·4.5와 도입 보류 중인 Gemini 4 Argon은 노출하지 않습니다.
근거는 sibling `internal-ai-platform/services/ai-gateway/config.template.yaml`과
`docs/litellm-compatibility/model-013-vertex-claude-sonnet-5.5.md`,
`model-014-vertex-claude-haiku-5.5.md`입니다 (LiteLLM v1.105.1).

두 모델은 context 1,000,000 / output 128,000, Pi가 지원하는 text·image 입력을
선언합니다. Gateway의 PDF 지원은 Pi modality로 추가하지 않습니다.
백만 token당 input/output/cache read/5분 cache write 가격은 Sonnet
$2/$10/$0.2/$2.5, Haiku $0.5/$2.5/$0.05/$0.625입니다. 할인 및 짧은 context
가격을 적용하지 않는 Gateway 보수적 단가입니다. Pi는 1시간 cache write usage가
구분되어 전달될 때 input × 2로 계산하므로 각각 $4/$1과 일치합니다. 실제 usage가
누락되면 catalog 가격만으로 비용 정합성을 보장하지 못합니다.

설치된 Pi 1.2.0의 `pi-ai/dist/providers/model-schema`, `dist/models.js` 및
`dist/api/openai-completions.js`에서 다음 동작을 확인했습니다.

- `thinkingLevelMap`의 `null`은 지원 level에서 제외합니다. Sonnet은 `off: null`로
  off를 제외하고, `minimal`은 두 모델 모두 `low` effort로 매핑합니다.
- Sonnet의 `between_tools`는 disabled와 다릅니다. 일반 OpenAI-compatible mapping은
  문자열을 `reasoning_effort`로 보낼 뿐 native `thinking.type`으로 바꾸지 않습니다.
  따라서 `between_tools`를 임의로 매핑하지 않습니다. Sonnet에서 off를 요청하면 Pi는
  지원 level로 clamp하므로 완전 비활성화가 아닙니다.
- Haiku의 off는 기존처럼 effort를 생략합니다. Native disabled 지원과 Pi의 effort
  생략은 동일한 계약이 아니며, 실제 비활성화 여부는 별도 acceptance 대상입니다.
- 실제 Pi text/thinking/tool/image 호출은 catalog 정적 검증과 별개입니다. Gateway의
  cache usage 및 단발 tool-result 422 잔여 제약도 별도 acceptance에서 확인해야 합니다.

## 기본 도구

bootstrap은 Pi 내장 Codemode를 기본 활성화합니다. 도구 결과를 코드로 필터링·집계한 뒤
필요한 출력만 모델에 전달할 수 있습니다. 별도 패키지 설치는 필요하지 않습니다.
기존 `defaultTools` 선택과 나머지 사용자 설정은 보존합니다.
Google Data Store 검색은 기본 비활성화입니다. 루트 manifest에서 검색 확장을 제외하고,
installer는 기존 pi-bootstrap Git 패키지에도 검색 진입점 제외 필터를 병합합니다.
`process_content`·Skill·다른 패키지는 유지합니다. 사용자가 별도 경로로 명시적으로
로드한 검색 확장은 자동 제거하지 않습니다.

```sh
python3 scripts/install-pi-tools.py
```

위 명령은 도구 설정만 적용합니다. 변경 전 `settings.json`을 `backups/`에 0600으로
백업하고 원자적으로 갱신하며, 재실행 시 변경이 없으면 백업을 만들지 않습니다.
`PI_CODING_AGENT_DIR`로 대상을 지정할 수 있습니다. 명시적으로 비활성화한
`builtin:codemode`나 심볼릭 링크 설정 파일은 자동으로 덮어쓰지 않습니다.
활성 세션에서는 `/reload`하거나 Pi를 새로 시작합니다.
CLI의 `--no-tools`, `--tools`, `--no-extensions` 등 실행별 선택은 별도로 확인합니다.
Codemode 활성화만으로 모델을 호출하거나 조회·전송 작업을 실행하지 않습니다.

## 비밀 주입

`LITELLM_API_KEY`는 장비의 secret loader에서 제공합니다. Firebat에서는 장비
설정 저장소가 SOPS + age와 `.envrc` 참조를 관리하므로 여기서 다시 만들지 않습니다.

다른 장비에서 direnv가 필요하면 `envrc.example`을 검토해 선택적으로 사용합니다.
부모 환경을 불러오고 이미 주입된 키를 참조할 뿐, 키를 직접 입력하는 파일이 아닙니다.

```sh
cp envrc.example .envrc
# 내용을 검토한 뒤:
direnv allow
```

bootstrap은 `.envrc`를 자동 생성하거나 승인하지 않습니다. 환경변수의 실제 값을
화면·로그·LLM 대화에 출력하지 마세요. 파일에 키가 없어도 같은 계정에서 실행되는
프로세스는 로드된 환경변수에 접근할 수 있습니다.

## 확장과 스킬

| 항목 | 관리 위치 |
|---|---|
| `process_content` | 이 저장소의 Git 패키지 |
| Google Data Store 검색 확장 | 소스 보존·기본 비활성화; 필요할 때 명시적으로 로드 |
| statusline·goal·usage | pi의 외부 npm 패키지 |
| Herdr 상태 연동 | Herdr가 설치·관리하는 확장 |
| find-skills·herdr 스킬 | 사용자 skill 디렉터리, 이 저장소 밖 |

`pi list`는 등록된 패키지를 보여줍니다. 리소스별 활성화는 `pi config`에서 확인할 수
있습니다. package 밖의 사용자 확장·스킬도 별도로 로드될 수 있습니다.

검색 도구의 Google 인증과 source catalog는
[검색 설정](../extensions/google-data-store-search/README.md)에서 관리합니다.
pi의 로그인 정보, 사용자 설정, 대화 기록은 이 저장소에 복제하지 않습니다.

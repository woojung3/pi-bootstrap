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
| 자체 검색 확장 | 이 저장소의 Git 패키지 |
| statusline·goal·usage | pi의 외부 npm 패키지 |
| Herdr 상태 연동 | Herdr가 설치·관리하는 확장 |
| find-skills·herdr 스킬 | 사용자 skill 디렉터리, 이 저장소 밖 |

`pi list`는 등록된 패키지를 보여줍니다. 리소스별 활성화는 `pi config`에서 확인할 수
있습니다. package 밖의 사용자 확장·스킬도 별도로 로드될 수 있습니다.

검색 도구의 Google 인증과 source catalog는
[검색 설정](../extensions/google-data-store-search/README.md)에서 관리합니다.
pi의 로그인 정보, 사용자 설정, 대화 기록은 이 저장소에 복제하지 않습니다.

# Pi 플러그인 & 익스텐션 아키텍처 및 팀 배포 가이드

Pi 코어 엔진의 확장 시스템은 CLI 기동 성능(Startup Performance) 극대화와 보안 통제(Security Sandboxing) 사이의 세밀한 기술적 트레이드오프를 고려하여 이원화 설계되어 있습니다. 이 문서는 Pi 확장 시스템의 내부 설계 원리와 이를 활용한 최적의 사내 협업/배포 전략을 정리한 공유용 가이드라인입니다.

---

## 1. 핵심 개념 및 구동 주체 (Architecture Separation)

Pi 내부에는 플러그인과 확장 요소를 관리하는 두 개의 독립적인 구동 주체가 존재합니다.

### A. 플러그인 매니저 (`PluginManager` / `pi install`)
* **역할**: 개발자가 시스템 보안 통제를 수락하고 직접 신뢰하는 공식 패키지 유통 통로입니다.
* **설치 대상**: 로컬 디렉터리, 전역 NPM 패키지, 또는 **직접 Git 원격 저장소 URL**(GitHub, Bitbucket, GitLab 등).
* **익스텐션 코드 실행 여부**: **지원 (O)**
  * `package.json` 내 `"pi"` 오브젝트 속 `"extensions"` 배열에 명시된 자바스크립트/타입스크립트 진입점(`index.ts` 등)을 가져와 `ExtensionAPI`와 함께 런타임에 완벽하게 기동시킵니다.
* **물리 위치**: 모든 플러그인 파일은 중앙 집중식 전역 공간인 `~/.pi/plugins/node_modules/` 하위에 위치하며, 로컬 링킹은 이 공간에 심볼릭 링크 형태로 연결됩니다.

### B. 로컬 프로젝트 자동 로딩 (`.pi/extensions/`)
* **역할**: 전역으로 설치하지 않고 특정 프로젝트 저장소에 종속되어 기동할 때 유용한 방식입니다.
* **설치 대상**: 프로젝트 루트 경로의 `.pi/extensions/` 디렉터리 내에 위치한 개별 TS 파일 및 서브 디렉터리.
* **보안 통제**: **프로젝트가 신뢰(Project Trust)된 후에만 로드됩니다.**
  * 프로젝트를 신뢰하기 전에는 임의의 코드가 마음대로 시스템을 장악하거나 악의적 코드를 원격으로 로드하지 못하도록 실행이 보류됩니다.

---

## 2. 왜 이런 설계를 선택했는가? (Technical Design Rationale)

1. **표준 `node_modules` 기반의 의존성 해석 (Dependency Resolution)**
   * `PluginManager`가 설치하는 전역/로컬 패키지는 표준 규격인 `~/.pi/plugins/node_modules/` 하위에 통합 배치되고 단일 `package.json`으로 관리됩니다. 덕분에 익스텐션 코드가 정상적으로 `import`하는 써드파티 패키지들을 Node/Bun이 기계적으로 정확하게 로드할 수 있습니다.
2. **명시적 신뢰 경계(Filesystem Trust Boundary)와 보안 샌드박스**
   * Pi 공식 아키텍처에 따르면, Pi 내부에는 임포트 시 동일 프로세스 내에서 실행되므로 **완전 격리된 안전한 이종 샌드박스가 없습니다(no in-process sandbox).**
   * 프로젝트 신뢰(Project Trust) 메커니즘은 악의적 저장소가 사용자의 사전 수락 없이 마음대로 `.pi/settings.json`, 시스템 프롬프트 확장, 또는 로컬 익스텐션을 로드하는 것을 물리적으로 차단하여 **입입 시점(Loading Guard)**을 방어합니다.
   * 따라서 더 안전한 로컬 오케스트레이션을 수행하려면 가상 머신(Gondolin 등), Docker 컨테이너, 혹은 별도의 샌드박스 보안 폴더에서 실행해야 합니다.

---

## 3. 실무에서의 최적의 팀 배포 및 공유 전략 (Distribution Best Practices)

위와 같은 설계 특성을 기반으로, 사내 개발팀은 플러그인의 성격에 맞춰 다음과 같은 하이브리드 전략을 유기적으로 선택하는 것이 가장 이상적입니다.

### 전략 ①: 사내 공통 도구 배포 (General-Purpose Utilities)
* **대상**: 사내 코딩 컨벤션 린터, 보안 정책 필터 등 전역 프로젝트에서 공용으로 활성화되어야 하는 무거운 익스텐션 코드들.
* **관리**: 사내 전용 GitHub, Bitbucket, GitLab 또는 프라이빗 NPM 레지스트리에 저장소를 개설하고 관리합니다.
* **팀원 배포**: 팀원들은 자신의 장비 터미널에서 아래 명령어 한 줄만 수행하여 전역 익스텐션으로 간편하게 사용합니다:
  ```bash
  # 전역 설치 (index.ts 내 코드 정상 실행)
  pi install git:github.com/my-org/shared-utils
  ```

### 전략 ②: 특정 프로젝트 종속 도구 배포 (Project-Specific Zero-Setup)
* **대상**: 특정 개발 프로젝트의 비즈니스 도메인 검증기, 데이터베이스 스키마 검수 렌더러 등 해당 저장소에서만 독립되어 동작해야 하는 소스 코드들.
* **관리**: 전역에 플러그인을 설치할 필요 없이, 개별 개발 프로젝트 저장소 내부의 **`.pi/extensions/`** 디렉터리 하위에 익스텐션 소스 폴더를 복사하거나 **Git Submodule**로 추가하여 함께 원격 저장소에 커밋(Check-in)합니다.
  ```bash
  git submodule add git@github.com:my-org/project-checker.git .pi/extensions/project-checker
  ```
* **팀원 배포**: 
  * Pi는 프로젝트 루트 밑의 `.pi/extensions/`를 사용자가 명시적으로 허용한 안전한 로컬 코드로 판단하여 **자동 감지 및 즉시 기동**합니다.
  * 다른 팀원들은 별도의 전역 `pi install`을 치지 않고, **프로젝트 클론(`git clone --recursive`)만 받아 에이전트를 키고 신뢰(`/trust`)를 허용하는 즉시 프로젝트 맞춤형 익스텐션이 자동 실행(Zero-Setup)되는 아주 아름다운 개발자 경험(DX)을 구현할 수 있습니다.

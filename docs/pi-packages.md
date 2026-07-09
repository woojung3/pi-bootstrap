# Pi 패키지 배포/설치

Pi 패키지는 `package.json`의 `pi` 필드로 extension/skill/prompt/theme를 선언한 npm/git/local 패키지입니다.

## 이 저장소의 전략

`pi-bootstrap`은 monorepo입니다.

```text
pi-bootstrap/
  package.json
  packages/
    pi-yolo/
    pi-academy/
    pi-google-data-store-search/
```

submodule 없이 하나의 GitHub repo에 설정과 개인 패키지를 같이 둡니다.

## 전체 설치

루트 `package.json`이 세 extension을 함께 선언하므로 repo 전체를 하나의 Pi package로 설치할 수 있습니다.

```bash
pi install git:github.com/woojung3/pi-bootstrap@v0.2.0
```

또는 로컬 clone에서:

```bash
pi install .
```

## 개별 설치

```bash
pi install ./packages/pi-yolo
pi install ./packages/pi-academy
pi install ./packages/pi-google-data-store-search
```

## 현재 개인 패키지

### pi-yolo

Always-Ask 도구 승인 게이트입니다. `/yolo`로 `always-ask`와 `yolo` 모드를 토글합니다.

```bash
pi install ./packages/pi-yolo
```

### pi-academy

Pi 실전 8단계 튜토리얼/아카데미입니다. `/tutorial`로 시작합니다.

```bash
pi install ./packages/pi-academy
```

### pi-google-data-store-search

Google Gemini Enterprise / Vertex AI Search Data Store source를 선택해 검색하는 도구입니다. Confluence, SharePoint 등 source catalog를 환경변수나 개인 JSON 파일로 설정합니다.

```bash
pi install ./packages/pi-google-data-store-search
```

자세한 설정은 [`../packages/pi-google-data-store-search/README.md`](../packages/pi-google-data-store-search/README.md)를 참고하세요.

## GitHub 업로드 절차

루트에서:

```bash
git init
git add .
git commit -m "Initial pi bootstrap"
git branch -M main
git remote add origin https://github.com/woojung3/pi-bootstrap
git push -u origin main
git tag v0.2.0
git push origin v0.2.0
```

그 후:

```bash
pi install git:github.com/woojung3/pi-bootstrap@v0.2.0
```

## npm 배포 선택사항

개별 패키지를 npm에 따로 배포할 수도 있습니다.

```bash
cd packages/pi-yolo
npm pack --dry-run
npm publish --access public

cd ../pi-academy
npm pack --dry-run
npm publish --access public
```

npm 배포 후:

```bash
pi install npm:pi-yolo@1.1.0
pi install npm:pi-academy@1.0.0
pi install npm:pi-google-data-store-search@0.1.0
```

## 패키징 체크리스트

- `package.json`에 `pi.extensions`가 있어야 합니다.
- 검색성을 위해 `keywords`에 `pi-package`를 넣습니다.
- 런타임 dependency는 `dependencies`에 둡니다.
- Pi SDK type import는 `peerDependencies`에 `@earendil-works/pi-coding-agent: "*"`로 선언합니다.
- `files` 필드를 둬서 `node_modules`, 테스트 산출물, 임시 파일이 tarball에 섞이지 않게 합니다.

# Pi 설치법

## 전제

- 이 저장소의 `bootstrap.sh`는 runtime dependency 설치에 Node.js와 **npm**을 사용합니다.
- `package-lock.json`을 기준으로 `npm ci --omit=dev`를 실행하므로 pnpm이나 Yarn은 필요하지 않습니다.
- `direnv` 사용을 권장합니다.

## 설치
```bash
curl -fsSL https://pi.dev/install.sh | sh
```

## 설치 확인

```bash
pi --version
pi --help
```

설치 후 한 번 실행합니다.

```bash
pi
```

프로젝트 신뢰 프롬프트가 나오면 신뢰할 저장소에서만 승인합니다.

## 업데이트

```bash
pi update
pi update --all          # pi와 설치된 패키지까지 갱신
pi update --extensions   # 패키지만 갱신
```

## 제거/패키지 관리

```bash
pi list
pi remove npm:<package-name>

# Codex 사용량 extension 설치
pi install npm:@narumitw/pi-codex-usage
```

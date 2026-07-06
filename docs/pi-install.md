# Pi 설치법

## 전제

- Node/npm 또는 pi 배포판에서 요구하는 런타임이 설치되어 있어야 합니다.
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
```

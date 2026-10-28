# Meet me Web

자연어 시간·장소 조건을 비공개로 모아 서로 다른 가능한 시간을 제안하는 Meet me 프론트엔드입니다. 조건은 앞뒤 공백을 제외하고 1~500자로 입력하며, 수동 시간표 입력은 지원하지 않습니다.

추천은 서로 다른 연속 시간창을 최대 세 개의 동등한 선택지로 보여줍니다. 각 안에서 실제 참석 인원과 제외된 참여자 이름을 확인하고 가능한 범위 안의 시작·종료를 선택합니다. 온라인·대면·둘 다 허용하는 방 설정을 존중하며, 일부 참석 후보의 제외 인원을 두 명으로 제한하지 않습니다. 과거 결과와 확정 일정은 유지합니다.

## 시작하기

요구 사항은 Node.js 22 이상과 Corepack입니다.

```powershell
corepack pnpm install
Copy-Item .env.example .env.local
corepack pnpm dev
```

로컬 백엔드가 `http://localhost:8080`에 있으면 Vite 프록시를 사용합니다. 다른 API를 사용할 때만 `VITE_API_BASE_URL`을 설정합니다.

## 주요 명령

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm build
corepack pnpm api:check
```

API 계약은 [openapi/meet-me.openapi.json](openapi/meet-me.openapi.json)에 고정되어 있습니다. 서버 변경을 함께 개발할 때는 서버가 로컬에서 생성한 OpenAPI를 검토해 이 파일에 동기화한 뒤 `corepack pnpm api:generate`와 `corepack pnpm api:check`를 실행합니다. 아직 배포되지 않은 계약을 운영 `api:snapshot`으로 덮어쓰지 않습니다. 운영 명세를 의도적으로 갱신할 때만 `corepack pnpm api:snapshot`을 실행하고 diff를 검토합니다.

## 문서

- [아키텍처와 결정 · 지속적인 UI 작업 기준](docs/ARCHITECTURE.md)
- [브랜치와 배포 흐름](docs/BRANCHING.md)
- [구현 기록](docs/IMPLEMENTATION_LOG.md)
- [배포 절차](docs/DEPLOYMENT.md)

# Meet me Web

자연어 조건과 가능한 시간표를 비공개로 모아 Plan A/B/C 약속 후보를 제안하는 Meet me 제출 MVP 프론트엔드입니다.

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

운영 OpenAPI는 [openapi/meet-me.openapi.json](openapi/meet-me.openapi.json)에 고정되어 있습니다. 명세를 의도적으로 갱신할 때만 `corepack pnpm api:snapshot`을 실행한 뒤 생성 타입 diff를 검토하고 `corepack pnpm api:generate`를 실행합니다.

## 문서

- [아키텍처와 결정](docs/ARCHITECTURE.md)
- [구현 기록](docs/IMPLEMENTATION_LOG.md)
- [배포 절차](docs/DEPLOYMENT.md)

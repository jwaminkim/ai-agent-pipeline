# 설계 방식 · 구조도 · 기술 스택

## 1. 전체 구조도

```
┌─────────────────────────────┐        ┌──────────────────────────────────────┐
│   Next.js 대시보드 (dashboard)  │        │   오케스트레이터 엔진 (engine)            │
│                              │        │   — 독립 Node.js 프로세스               │
│  app/page.tsx (탭 6개)         │        │                                      │
│   01 프로젝트 시작              │        │  orchestrator.js  (12단계 순차 실행,     │
│      (업로드+기술스택+에이전트     │        │   전 단계 runWithPmRouting으로 통합)     │
│       선택+시작 버튼 통합)         │        │    ├─ agents/*.js  (역할별 호출)        │
│   02 진행 현황                  │        │    ├─ lib/checkpoint.js (재개 지점)     │
│   03 이슈 히스토리               │        │    ├─ lib/usageMonitor.js (한도 감지)   │
│   04 지식 베이스                 │        │    ├─ lib/authCheck.js (로그인 확인)    │
│   05 CTO 대화                  │        │    └─ lib/claudeClient.js (CLI 호출)    │
│   06 설계 원칙                  │        │                                      │
│                              │        └──────────────────────────────────────┘
│  app/api/*/route.ts           │                        │
│   (얇은 API — 조회/승인/설정)      │                        │
│  lib/engineBridge.ts          │  ─── engine/lib/*.js를 직접 require() (중복 제거)
└──────────────┬───────────────┘                        │
               │              둘 다 아래 파일만 보고 상태를 주고받음
               ▼                                          ▼
        ┌───────────────────────────────────────────────────────┐
        │                     state/  (파일 기반 공유 상태)          │
        │  pipeline_status.json (엔진 전용) · agent_selection.json │
        │  (대시보드 전용, 경합조건 방지로 분리) · approvals.json      │
        │  tech_stack.json · uploads/ · agents/*.history/.status   │
        │  issues/issue_history.json · knowledge/patterns.json     │
        │  usage.json · engine.log · engine.pid.json               │
        └───────────────────────────────────────────────────────┘
```

**핵심 원칙: 대시보드와 엔진은 파일을 통해서만 대화합니다.** 서로 직접 함수를 호출하거나 소켓으로
묶여있지 않습니다 — 그래서 엔진이 5시간을 대기하는 동안 대시보드를 껐다 켜도, 새로고침해도 전혀
문제가 없습니다.

**단, 코드(로직)는 engine/lib에만 두고 대시보드가 그걸 재사용합니다.** `dashboard/lib/engineBridge.ts`가
`engine/lib/claudeClient.js`, `usageMonitor.js`, `authCheck.js`를 경로로 직접 `require()`합니다.
(예전엔 대시보드가 이 로직들을 따로 복제해서 갖고 있었는데, 한쪽만 고치고 반대쪽을 깜빡하는 문제가
실제로 있었어서 — 시니어 리뷰 후 이렇게 정리했습니다.)

---

## 2. 왜 이렇게 나눴는가 (기술 스택 선택 근거)

### 2-1. Next.js를 골랐지만, 대시보드와 엔진은 반드시 분리

Next.js의 API Routes만으로는 "5시간 동안 대기했다가 자동으로 재개하는 백그라운드 루프"를 안전하게
운영할 수 없습니다:
- API 라우트는 요청-응답 모델에 최적화되어 있어, 그 안에서 몇 시간을 붙잡고 있으면 개발 중
  핫 리로드(코드 저장 시 서버 재시작)에 의해 진행 중이던 루프가 그대로 죽어버립니다.
- 그래서 **오케스트레이터 엔진(engine/orchestrator.js)은 Next.js 밖의 완전히 독립된 Node.js
  프로세스**로 분리했습니다. 대시보드의 "①번 탭 → 파이프라인 시작" 버튼은 이 엔진 프로세스를
  `child_process.spawn(..., {detached: true})`로 직접 띄우고(`app/api/engine/start/route.ts`),
  그 뒤로는 파일(state/)로만 소통합니다.

### 2-2. React(Vite) 대신 Next.js를 고른 이유

React만 쓰면 "얇은 API 계층"을 위해 Express 서버를 별도로 하나 더 구성해야 합니다. Next.js는
API Routes가 그 역할을 내장하고 있어서, **화면 + API가 하나의 프로젝트로 통합**되고 관리할
코드베이스가 하나 줄어듭니다. (SSR/SEO 등 Next.js의 다른 강점은 로컬 1인 도구 특성상 크게
활용되지 않지만, 이 프로젝트 규모에서 단점이라 할 정도는 아닙니다.)

### 2-3. DB 대신 파일(JSON) 기반 상태

- 로컬에서 혼자 쓰는 도구 규모에서는 DB를 둘 필요가 없다고 판단했습니다.
- 체크포인트/이슈 로그/지식 베이스 전부 `state/` 아래 JSON 파일로 저장하고,
  `engine/lib/atomicFile.js`가 "임시파일에 쓰고 rename" 방식으로 원자적 쓰기를 보장해
  프로세스가 죽어도 파일이 반쪽으로 남지 않게 했습니다.
- **주의**: `enabled_stages`(에이전트 선택)는 `pipeline_status.json`(엔진이 진행상태를 계속 갱신)과
  분리해서 `agent_selection.json`이라는 별도 파일에 둡니다. 처음엔 한 파일에 같이 뒀었는데,
  대시보드와 엔진이 동시에 같은 파일을 read-modify-write하면서 한쪽 변경이 유실되는 경합 조건이
  있어서 시니어 리뷰 후 분리했습니다.
- 나중에 프로젝트 수가 많아지고 검색/필터링이 무거워지면, `knowledgeBase.js` 하단 주석에
  적어둔 것처럼 벡터DB로 이관하는 경로를 열어뒀습니다.

### 2-4. .NET 등 다른 백엔드 프레임워크를 쓰지 않은 이유

프론트(Next.js/React)와 백엔드(Node.js 엔진)를 **같은 언어(JavaScript/TypeScript)**로
통일해서, 타입/인터페이스를 공유하기 쉽고 유지보수 부담을 줄였습니다. 이 프로젝트 규모에서
다른 언어 스택을 섞을 이유가 없습니다.

---

## 3. 자율 해결 우선 원칙 (Tier) 구현 위치

- `engine/prompts/pm.md` — PM 에이전트의 판단 기준을 텍스트로 정의
- `engine/agents/pm.js` → `classifyFailure()` — 실패를 Tier 1/2/3로 분류
- `engine/orchestrator.js` → `runWithPmRouting()` — Tier에 따라 재시도/가정후진행/사람에스컬레이션 분기
- **12단계 전부** 이 함수로 감싸져 있습니다 (처음엔 개발·리뷰·테스트 6개만 감쌌었는데, 나머지
  단계가 실패해도 그냥 "완료"로 넘어가는 버그가 시니어 리뷰에서 발견되어 전 단계로 확장했습니다).
- Tier 1: 자동 재시도 (최대 횟수는 `engine/config/pipeline.config.json`의 `retry.tier1MaxRetries`)
- Tier 2: `issue_history`에 `resolved`로 기록 후 계속 진행 (실시간으로 사람에게 안 물어봄)
- Tier 3: `issue_history`에 `pending`으로 기록, `waitForHumanApproval()`로 대시보드의 승인/결정을 대기
- `needs_clarification` 상태(기획 에이전트가 질문이 있을 때)도 별도로 감지해서 사람에게 escalate합니다.

---

## 4. 사용량(토큰) 소진 대응 구현 위치

- `engine/lib/usageMonitor.js` — `/usage` 명령은 헤드리스 모드에서 작동하지 않는다는 걸 공식 문서로
  확인했기 때문에, `~/.claude/projects/**/*.jsonl` 로컬 세션 로그를 직접 파싱해서 최근 5시간/7일
  실제 토큰 사용량(원시 수치)을 계산합니다. 플랜별 정확한 한도가 공개되어 있지 않아 "%"는 기본적으로
  표시하지 않지만, `CLAUDE_CODE_OAUTH_TOKEN` 환경변수가 있으면 비공식 API로 %도 추가 조회합니다.
- `engine/lib/claudeClient.js` → `UsageLimitError` — CLI 응답에서 한도 도달 감지 시 특수 에러로 전달
- `engine/orchestrator.js` → `main()`의 catch 블록 — 5시간 캡이면 프로세스를 유지한 채 대기 후 자동
  재개(실제 사용 이력의 가장 오래된 시점을 기준으로 리셋 시각 추정), 주간 캡이면 자동 대기하지 않고
  사람에게 알리도록 분기
- 대시보드는 `dashboard/lib/engineBridge.ts`를 통해 이 파일의 함수를 그대로 재사용합니다
  (별도 복제 없음).

## 5. 이슈 히스토리 / 지식 베이스 / CTO 대화 구현 위치

- `engine/lib/issueLog.js` — 자동해결/사람결정대기/사람결정완료 3가지 상태로 기록
- `engine/lib/knowledgeBase.js` — 사람이 승인한 패턴만 저장하는 `addPattern()`이 정의되어 있으나,
  **아직 실제로 호출하는 곳이 없어 지식 베이스 탭은 항상 비어있습니다** (README 7번 섹션 참고 — 다음에
  붙일 기능 1순위).
- `dashboard/components/IssueHistoryTab.tsx`, `KnowledgeBaseTab.tsx` — 각각의 화면
- `dashboard/app/api/cto/route.ts` — CTO 에이전트 실제 대화. `engine/prompts/cto.md`를 시스템
  프롬프트로 쓰고, 상태 요약 카드 + 대기 이슈를 컨텍스트로 넣어 `engineBridge`를 통해
  `engine/lib/claudeClient.js`의 `callText()`(일반 텍스트 모드)를 호출합니다. "더 자세히" 요청 시에만
  해당 에이전트 원본 히스토리 최근 6턴을 추가로 넣습니다. 로그인 안 됐거나 CLI 없으면 명확한 안내
  메시지로 응답합니다.

## 6. 기술 스택 설정 / 기존 프로젝트 수정 모드 구현 위치

- `dashboard/app/api/techstack/route.ts`, `state/tech_stack.json` — 언어·프레임워크·프로젝트유형·
  UI프레임워크·ORM·출력위치(`output_path`)·참고코드경로(`reference_paths`, 배열)·프로젝트모드
  (`project_mode`: "new" | "existing")를 저장
- `engine/orchestrator.js` → `runStage()` 시작부 — `project_mode`가 "new"면 `output_path`를
  미리 생성, "existing"이면 실제 존재하는지 검증(없으면 에러로 중단, 실수로 빈 폴더에 새로 만들어버리는
  사고 방지)
- `engine/agents/design.js`, `pl.js`, `dev.js` — `project_mode`가 "existing"이면 "기존 구조를 먼저
  읽고 최소 범위로만 수정하라"는 지침을, 언어/프레임워크가 비어있으면 "폴더 안 파일을 보고 스스로
  판단하라"는 지침을, `reference_paths`가 있으면 "스타일 참고용, 수정 금지" 지침을 프롬프트에 추가
- `engine/agents/dev.js` — `output_path`를 Claude Code의 작업 디렉토리(cwd)로 지정해서 실행 (다른
  드라이브를 지정해도 정확히 그 폴더 안에 산출물이 생기도록)

## 7. 헤드리스 모드 권한 처리 (크리티컬 — 시니어 리뷰에서 발견 후 수정)

- `engine/lib/claudeClient.js` — Claude Code는 헤드리스(`-p`) 모드에서 도구(파일읽기/쓰기/Bash)
  사용 전 권한을 미리 승인해두지 않으면 에러 없이 영원히 멈춘다는 걸 공식 문서로 확인했습니다.
  모든 호출에 `--permission-mode acceptEdits`를 기본 적용했고, 혹시 모를 다른 원인의 무한 대기에
  대비해 단일 호출 최대 15분 타임아웃(`CallTimeoutError`)도 추가했습니다.
- **아직 검증 안 됨**: 이 모드가 Bash 도구까지 커버하는지는 실제 로컬 환경에서 한 번 돌려봐야 압니다.

---

## 8. 확장 아이디어 (지금 다음 단계)

- 대시보드가 파일을 폴링(10~15초 간격)하는 대신, 엔진이 상태 변경 시 로컬 WebSocket으로 즉시 알리게
  하면 더 실시간처럼 느껴집니다.
- `knowledgeBase.js`의 `addPattern()`을 실제로 호출하는 흐름 만들기 (예: 납품 단계 완료 후 "이번
  프로젝트에서 배운 점을 지식베이스에 남기겠습니까" 확인 절차) — 지금은 이 연결이 아예 없습니다.
- `knowledgeBase.js`의 키워드 매칭 검색을 임베딩 기반 유사도 검색(벡터DB)으로 교체.
- 프로젝트 간 격리(여러 프로젝트 동시 진행) — 지금은 `state/` 하나가 프로젝트 하나만 처리 가능한
  구조라, 프로젝트별로 state 폴더를 분리하는 작업이 필요합니다.
- Electron으로 감싸서 아이콘 클릭 한 번으로 대시보드+엔진이 함께 뜨는 데스크톱 앱으로 패키징.

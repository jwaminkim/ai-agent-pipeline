#!/usr/bin/env node
/**
 * 오케스트레이터 (독립 Node.js 프로세스)
 * Next.js 대시보드와는 별도 프로세스로 실행한다 (설계 이유는 README/ARCHITECTURE.md 참고).
 *
 * 실행: node engine/orchestrator.js
 * 데모(실 Claude 호출 없이 흐름만 확인): CLAUDE_DRY_RUN=1 node engine/orchestrator.js
 */
const fs = require("fs");
const path = require("path");

const checkpoint = require("./lib/checkpoint");
const { UsageLimitError } = require("./lib/claudeClient");
const { estimateResetAt, checkAndSaveUsageOnce } = require("./lib/usageMonitor");
const { addIssue } = require("./lib/issueLog");
const { readJSON, writeJSONAtomic } = require("./lib/atomicFile");
const { checkClaudeAuth } = require("./lib/authCheck");

const planning = require("./agents/planning");
const design = require("./agents/design");
const pl = require("./agents/pl");
const dev = require("./agents/dev");
const review = require("./agents/review");
const test = require("./agents/test");
const security = require("./agents/security");
const docs = require("./agents/docs");
const devops = require("./agents/devops");
const delivery = require("./agents/delivery");
const pm = require("./agents/pm");

const CONFIG = require("./config/pipeline.config.json");
const STATE_DIR = path.join(__dirname, "..", "state");
const APPROVALS_FILE = path.join(STATE_DIR, "approvals.json");
const INPUT_FILE = path.join(STATE_DIR, "project_input.md");
const UPLOADS_DIR = path.join(STATE_DIR, "uploads");

/** 업로드된 파일들의 절대경로 목록을 만든다.
 *  ⚠️ 파일 내용을 여기서 미리 읽지 않는다 — xlsx/pptx/docx/pdf 등은 Claude Code 자신이
 *     내장된 파일 읽기 능력(스킬)으로 열어서 분석하게 한다. 텍스트로 미리 읽으면 바이너리
 *     포맷은 깨진 내용만 남는다. */
function loadRequirementsFilePaths() {
  if (fs.existsSync(UPLOADS_DIR)) {
    const files = fs.readdirSync(UPLOADS_DIR).filter((f) => !f.startsWith("."));
    if (files.length) return files.map((f) => path.join(UPLOADS_DIR, f));
  }
  if (fs.existsSync(INPUT_FILE)) return [INPUT_FILE];
  return [];
}

function stageOrder(stageId) {
  const s = CONFIG.stages.find((x) => x.id === stageId);
  return s ? s.order : -1;
}

function loadApprovals() {
  return readJSON(APPROVALS_FILE, { requirements: false, design: false, delivery: false });
}

/** 에이전트 선택(enabled_stages)은 pipeline_status.json과 별도 파일로 분리되어 있음
 *  — 대시보드(선택 저장)와 엔진(진행상태 갱신)이 같은 파일을 동시에 read-modify-write 하면서
 *    한쪽 변경이 유실되는 경합 조건이 있었음. 파일을 나눠서 원천적으로 제거함. */
function loadEnabledStages() {
  const p = path.join(STATE_DIR, "agent_selection.json");
  const data = readJSON(p, { enabled_stages: [] });
  if (data.enabled_stages && data.enabled_stages.length) return data.enabled_stages;
  return CONFIG.presets["full-delivery"].enabledStages;
}

async function waitForHumanApproval(checkpointName, maxPolls = 60, intervalMs = 5000) {
  checkpoint.markWaitingForHuman(checkpointName);
  console.log(`\n⏸  사람 승인 대기: "${checkpointName}" — 대시보드에서 승인해주세요.`);
  for (let i = 0; i < maxPolls; i++) {
    const approvals = loadApprovals();
    if (approvals[checkpointName]) {
      console.log(`✅ "${checkpointName}" 승인 확인됨. 재개합니다.`);
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.log(`⌛ "${checkpointName}" 승인 대기 시간 초과. 엔진을 종료합니다. 승인 후 다시 실행해주세요.`);
  return false;
}

/** 재시도 + PM 분류 루프가 필요한 단계(개발/리뷰/테스트류) 공용 실행기 */
async function runWithPmRouting(stageId, runOnce) {
  const maxRetries = CONFIG.retry.tier1MaxRetries;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const result = await runOnce();
    const failed = result.status === "failed" || result.status === "fail";
    if (!failed) return result;

    attempt++;
    const classification = await pm.classifyFailure({
      stageId,
      failureDetail: result,
      retryCount: attempt,
      maxRetries,
    });

    const tier = classification.tier || (attempt > maxRetries ? 3 : 1);

    if (tier === 1 && attempt <= maxRetries) {
      addIssue({
        stage: stageId,
        requirementIds: result.requirement_ids || [],
        classification: "bug",
        status: "resolved",
        title: `${stageId} 실패 → 자동 재시도 (${attempt}/${maxRetries})`,
        description: result.detail || "구현 버그로 분류되어 자동 재시도",
        reasoning: classification.reasoning,
      });
      continue; // 개발 에이전트로 재전송 (다음 루프)
    }

    if (tier === 2) {
      addIssue({
        stage: stageId,
        requirementIds: result.requirement_ids || [],
        classification: "design",
        status: "resolved",
        title: `${stageId} 이슈 → 가정 후 진행`,
        description: result.detail || "",
        resolution: "합리적 가정으로 진행, 다음 정기 승인에서 일괄 검토 예정",
        reasoning: classification.reasoning,
      });
      return { ...result, status: "completed", proceeded_with_assumption: true };
    }

    // Tier 3: 즉시 사람 에스컬레이션
    addIssue({
      stage: stageId,
      requirementIds: result.requirement_ids || [],
      classification: classification.decision === "back_to_planning" ? "requirement" : "design",
      status: "pending",
      title: `${stageId} — 사람 결정 필요`,
      description: result.detail || classification.issue_summary || "",
      reasoning: classification.reasoning,
    });
    const approved = await waitForHumanApproval(`issue:${stageId}`);
    if (!approved) process.exit(0);
    return { ...result, status: "completed", human_decided: true };
  }
  return { status: "failed", detail: "최대 재시도 초과" };
}

/** state/tech_stack.json에서 사람이 설정(또는 추천받아 저장)한 기술 스택을 읽는다 */
function loadTechStack() {
  const p = path.join(STATE_DIR, "tech_stack.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

async function runStage(stageId, requirements, design_, interfaceContract) {
  checkpoint.markRunning(stageId);
  console.log(`\n▶ ${stageId} 실행 중...`);
  const techStack = loadTechStack();

  // output_path 처리: 신규 프로젝트면 미리 폴더를 만들고, 기존 프로젝트 수정이면 반드시 이미 존재해야 함
  // (기존 모드에서 없는 경로를 그냥 mkdir 해버리면 오타로 인해 엉뚱한 빈 폴더에 "새로 생성"해버리는
  //  위험한 상황이 생길 수 있어 — 존재하지 않으면 에러로 멈춘다)
  if (techStack.output_path) {
    if (techStack.project_mode === "existing") {
      if (!fs.existsSync(techStack.output_path)) {
        throw new Error(
          `기존 프로젝트 경로(${techStack.output_path})가 존재하지 않습니다. "기존 프로젝트 수정" 모드에서는 ` +
          `이미 있는 폴더여야 합니다 — 경로를 다시 확인하거나, 신규 프로젝트라면 "신규 프로젝트" 모드로 바꿔주세요.`
        );
      }
      const entries = fs.readdirSync(techStack.output_path).filter((f) => !f.startsWith("."));
      if (!entries.length) {
        console.log(`⚠ 경고: ${techStack.output_path} 가 비어있습니다 — "기존 프로젝트 수정"인데 실제로는 기존 코드가 없어 보입니다.`);
      }
    } else {
      try {
        fs.mkdirSync(techStack.output_path, { recursive: true });
      } catch (err) {
        console.log(`⚠ output_path(${techStack.output_path}) 생성 실패: ${err.message}`);
      }
    }
  }

  switch (stageId) {
    case "01-planning": {
      const filePaths = loadRequirementsFilePaths();
      return runWithPmRouting(stageId, () => planning.run({ filePaths, techConstraints: techStack }));
    }
    case "03-design":
      return runWithPmRouting(stageId, () => design.run({ requirements, techConstraints: techStack }));
    case "04-pl":
      return runWithPmRouting(stageId, () => pl.run({ design: design_, techConstraints: techStack }));
    case "05-dev-db":
      return runWithPmRouting(stageId, () => dev.run({ part: "db", interfaceContract, techConstraints: techStack }));
    case "05-dev-be":
      return runWithPmRouting(stageId, () => dev.run({ part: "backend", interfaceContract, techConstraints: techStack }));
    case "05-dev-fe":
      return runWithPmRouting(stageId, () => dev.run({ part: "frontend", interfaceContract, techConstraints: techStack }));
    case "06-review":
      return runWithPmRouting(stageId, () => review.run({ changedFiles: [], techConstraints: techStack }));
    case "07-unittest":
      return runWithPmRouting(stageId, () => test.run({ kind: "unit", target: {} }));
    case "08-e2e":
      return runWithPmRouting(stageId, () => test.run({ kind: "e2e", target: {} }));
    case "09-security":
      return runWithPmRouting(stageId, () => security.run({ target: {} }));
    case "10-docs":
      return runWithPmRouting(stageId, () => docs.run({ project: {} }));
    case "11-devops":
      return runWithPmRouting(stageId, () => devops.run({ target: {} }));
    case "12-delivery":
      return runWithPmRouting(stageId, () => delivery.run({ project: {} }));
    default:
      throw new Error(`알 수 없는 stage: ${stageId}`);
  }
}

async function main() {
  console.log("=== AI 에이전트 개발 파이프라인 오케스트레이터 ===");
  if (process.env.CLAUDE_DRY_RUN === "1") {
    console.log("(DRY RUN 모드 — 실제 Claude 호출 없음, 로그인 체크 생략)\n");
  } else {
    const auth = checkClaudeAuth();
    if (!auth.installed) {
      console.log("🛑 claude 명령을 찾을 수 없습니다. Claude Code CLI가 설치되어 있는지 확인해주세요.");
      checkpoint.saveStatus({ status: "error", error: "claude CLI 미설치" });
      return;
    }
    if (!auth.loggedIn) {
      console.log("🛑 Claude Code에 로그인되어 있지 않습니다. 터미널에서 `claude auth login`을 먼저 실행해주세요.");
      checkpoint.saveStatus({ status: "error", error: "Claude 로그인 필요 (claude auth login)" });
      return;
    }
    console.log("✅ Claude Code 로그인 확인됨.\n");

    console.log("📊 시작 전 현재 토큰 사용량 확인 중 (로컬 세션 로그 기반)...");
    const startUsage = await checkAndSaveUsageOnce();
    if (startUsage.source === "local_session_logs") {
      console.log(
        `   최근 5시간: 입력 ${startUsage.last_5h.input_tokens.toLocaleString()} / 출력 ${startUsage.last_5h.output_tokens.toLocaleString()} 토큰 (${startUsage.last_5h.message_count}건)`
      );
      console.log(
        `   최근 7일: 입력 ${startUsage.last_7d.input_tokens.toLocaleString()} / 출력 ${startUsage.last_7d.output_tokens.toLocaleString()} 토큰 (${startUsage.last_7d.message_count}건)`
      );
      console.log(`   ⚠ 플랜별 정확한 한도가 공개되어 있지 않아 "한도 대비 %"는 계산할 수 없습니다 — 원시 수치입니다.\n`);
    } else {
      console.log(`   ⚠ ${startUsage.note}\n`);
    }
  }

  let status = checkpoint.loadStatus();
  const enabledStages = loadEnabledStages()
    .slice()
    .sort((a, b) => stageOrder(a) - stageOrder(b));

  let requirements = null;
  let designOutput = null;
  let interfaceContract = null;

  for (const stageId of enabledStages) {
    status = checkpoint.loadStatus();
    if (status.last_completed_stage && stageOrder(stageId) <= stageOrder(status.last_completed_stage)) {
      console.log(`⏭  ${stageId} 는 이미 완료됨 — 건너뜀`);
      continue;
    }

    const stageDef = CONFIG.stages.find((s) => s.id === stageId);

    // 사람 승인 체크포인트 여부는 stageDef에서 그대로 확인 (별도 처리 불필요)

    try {
      const result = await runStage(stageId, requirements, designOutput, interfaceContract);

      // ⚠️ 이전에는 dev/review/test(runWithPmRouting으로 감싼 단계)만 실패를 체크했고,
      // 기획/설계/PL/보안/문서화/배포/납품은 실패해도 그냥 "완료"로 넘어가는 버그가 있었음.
      // 모든 단계에 대해 공통으로 실패·명확화필요 상태를 체크하도록 수정.
      if (result.status === "failed" || result.status === "fail") {
        addIssue({
          stage: stageId,
          requirementIds: result.requirement_ids || [],
          classification: "bug",
          status: "pending",
          title: `${stageId} 실패 — 재시도 루프가 없는 단계라 사람 확인 필요`,
          description: result.detail || "결과 파싱 실패 또는 처리 실패",
        });
        const approved = await waitForHumanApproval(`issue:${stageId}`);
        if (!approved) return;
        // 사람이 확인 후 승인했다면, 일단 이 실행에서는 결과를 그대로 쓰지 않고 파이프라인을 멈춘다
        // (자동 재시도 로직이 없는 단계이므로 재실행은 사람이 직접 엔진을 다시 실행해야 함)
        console.log(`⚠ ${stageId}는 자동 재시도 로직이 없습니다. 문제를 해결한 뒤 엔진을 다시 실행해주세요.`);
        checkpoint.saveStatus({ status: "error", error: `${stageId} 실패 — 확인 후 재실행 필요` });
        return;
      }
      if (result.status === "needs_clarification") {
        addIssue({
          stage: stageId,
          requirementIds: result.requirement_ids || [],
          classification: "requirement",
          status: "pending",
          title: `${stageId} — 명확화가 필요한 질문이 있습니다`,
          description: (result.questions || []).join(" / ") || "에이전트가 진행 전 확인이 필요하다고 응답함",
        });
        const approved = await waitForHumanApproval(`issue:${stageId}`);
        if (!approved) return;
        console.log(`⚠ 질문에 답변하신 내용을 반영해 엔진을 다시 실행해주세요 (예: 요구사항 파일을 보강하거나 이슈 히스토리에 결정을 남긴 뒤 재실행).`);
        checkpoint.saveStatus({ status: "waiting_for_human", human_wait_reason: `${stageId}:needs_clarification` });
        return;
      }

      if (stageId === "01-planning") requirements = result.output?.requirements ? result : requirements;
      if (stageId === "03-design") designOutput = result;
      if (stageId === "04-pl") interfaceContract = result.interface_contract;

      if (stageDef?.humanCheckpoint) {
        const approved = await waitForHumanApproval(stageDef.humanCheckpoint);
        if (!approved) return;
      }

      checkpoint.markStageComplete(stageId);
      console.log(`✔ ${stageId} 완료`);
    } catch (err) {
      if (err instanceof UsageLimitError) {
        // 한도 도달 시점에 사용량을 다시 한번 체크해서, 실제 사용 이력 기준으로 리셋 시각을 추정한다
        const usage = await checkAndSaveUsageOnce();
        const windowUsage = err.limitType === "weekly" ? usage.last_7d : usage.last_5h;
        const resetAt = estimateResetAt(err.limitType, windowUsage?.earliest_ts);
        checkpoint.markWaitingForReset(err.limitType, resetAt);

        if (err.limitType === "weekly") {
          console.log(`\n🛑 주간 사용량 한도 도달. 예상 리셋: ${resetAt}`);
          console.log("주간 캡은 자동 대기하지 않습니다 — 사람 확인 후 다시 실행해주세요.");
          return;
        }

        const waitMs = new Date(resetAt).getTime() - Date.now();
        console.log(`\n⏳ 5시간 세션 한도 도달. 예상 리셋: ${resetAt} (${Math.round(waitMs / 60000)}분 후)`);
        if (waitMs > 0 && waitMs < 6 * 60 * 60 * 1000) {
          console.log("프로세스를 유지한 채 대기합니다. 종료하지 마세요...");
          await new Promise((r) => setTimeout(r, waitMs + 5000));
          console.log("재개합니다.");
          return main(); // 재귀적으로 재개 (체크포인트 기준 이어서 진행됨)
        } else {
          console.log("대기 시간이 비정상적으로 깁니다. 엔진을 종료합니다 — 리셋 후 수동으로 재실행해주세요.");
          return;
        }
      }
      console.error(`❌ ${stageId} 처리 중 예외:`, err.message);
      checkpoint.saveStatus({ status: "error", error: err.message });
      return;
    }
  }

  checkpoint.saveStatus({ status: "done" });
  console.log("\n🎉 파이프라인 완료.");
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});

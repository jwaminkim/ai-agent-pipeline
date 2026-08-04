/**
 * 에이전트 1회 호출 공용 러너
 * - prompts/<role>.md를 시스템 프롬프트로 사용
 * - 실행 결과를 history + status card에 기록
 * - CLAUDE_DRY_RUN=1 이면 실제 CLI를 호출하지 않고 가짜 성공 응답을 돌려줌
 *   (Claude Code 설치/로그인 없이도 파이프라인 흐름 자체를 테스트해볼 수 있게)
 */
const fs = require("fs");
const path = require("path");
const { callAgent } = require("./claudeClient");
const { appendTurn, updateStatusCard } = require("./agentHistory");

const PROMPTS_DIR = path.join(__dirname, "..", "prompts");
const CONFIG = require("../config/pipeline.config.json");

function loadSystemPrompt(role) {
  const p = path.join(PROMPTS_DIR, `${role}.md`);
  return fs.readFileSync(p, "utf-8");
}

/** 역할별로 pipeline.config.json > models 에 지정된 모델을 찾는다. 없으면 default, 둘 다 없으면 undefined(Claude Code 기본값) */
function resolveModel(role) {
  const models = CONFIG.models || {};
  return models[role] || models.default || undefined;
}

function dryRunResponse(agentName, userPrompt) {
  // 데모/개발용 가짜 응답 — 승인 화면에서 실제로 뭐가 보이는지 확인할 수 있도록 역할별로 구조화된 형태로 흉내낸다.
  if (agentName === "planning") {
    return {
      status: "completed",
      requirement_ids: ["REQ-001", "REQ-002", "REQ-003"],
      output: {
        requirements: [
          { id: "REQ-001", title: "회원가입 / 로그인", description: "이메일 기반 가입, 로그인, 비밀번호 재설정", priority: "high" },
          { id: "REQ-002", title: "결제 (외부 PG 연동)", description: "외부 결제사 API 연동, 실패 처리 포함", priority: "high" },
          { id: "REQ-003", title: "관리자 대시보드", description: "가입자/결제 현황 조회", priority: "medium" },
        ],
      },
      assumptions: ["[DRY_RUN] 우선순위는 문서에 명시되지 않아 기능 성격에 따라 임의로 추정함"],
      questions: [],
      sources_used: ["state/uploads/* (드라이런 — 실제로 파일을 읽지 않음)"],
    };
  }
  return {
    status: "completed",
    output: { note: `[DRY_RUN] ${agentName} 에이전트가 다음 입력에 대해 처리 완료로 응답: ${userPrompt.slice(0, 80)}...` },
    requirement_ids: [],
    assumptions: [],
    evidence: { type: "dry_run", detail: "실제 Claude Code 호출 없이 생성된 목 응답" },
  };
}

async function runAgentStage({ agentName, role, userPrompt, cwd }) {
  updateStatusCard(agentName, { current_status: "running" });

  let parsed;
  if (process.env.CLAUDE_DRY_RUN === "1") {
    parsed = dryRunResponse(agentName, userPrompt);
    appendTurn(agentName, { role: "user", content: userPrompt });
    appendTurn(agentName, { role: "assistant", content: JSON.stringify(parsed) });
  } else {
    const systemPrompt = loadSystemPrompt(role);
    const model = resolveModel(role);
    const result = await callAgent({ systemPrompt, userPrompt, model, cwd }); // UsageLimitError는 호출부(orchestrator)에서 캐치
    appendTurn(agentName, { role: "user", content: userPrompt });
    appendTurn(agentName, { role: "assistant", content: result.raw });
    parsed = result.parsed || { status: "failed", detail: "JSON 파싱 실패 — 원문을 history에서 확인" };
  }

  updateStatusCard(agentName, {
    current_status: parsed.status || "unknown",
    summary: summarize(parsed),
    open_issues: parsed.open_issues || [],
    last_output: parsed, // 승인 화면에서 전체 구조화 내용을 보여주기 위해 통째로 저장
  });

  return parsed;
}

function summarize(parsed) {
  if (parsed.output?.requirements) {
    return `요구사항 ${parsed.output.requirements.length}건 분석 완료 (${parsed.requirement_ids?.join(", ") || ""})`;
  }
  if (parsed.output?.note) return parsed.output.note;
  if (parsed.detail) return parsed.detail;
  return `status=${parsed.status || "unknown"}`;
}

module.exports = { runAgentStage, loadSystemPrompt };

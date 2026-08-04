const { runAgentStage } = require("../lib/runAgentStage");

/** 실패 원인 분류 + 티어 판단 (자율 해결 우선 원칙) */
async function classifyFailure({ stageId, failureDetail, retryCount, maxRetries }) {
  const userPrompt = `다음 실패를 분류하고 Tier(1/2/3)와 다음 행동을 결정하세요.\n단계: ${stageId}\n실패 상세: ${JSON.stringify(failureDetail)}\n현재 재시도 횟수: ${retryCount} / 최대 ${maxRetries}`;
  return runAgentStage({ agentName: "pm", role: "pm", userPrompt });
}

module.exports = { classifyFailure };

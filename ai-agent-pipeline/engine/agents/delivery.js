const { runAgentStage } = require("../lib/runAgentStage");

async function run({ project }) {
  const userPrompt = `최종 빌드, 문서, 추적 매트릭스를 납품 패키지로 구성하고 고객사 격리를 최종 확인하세요.\n프로젝트: ${JSON.stringify(project)}`;
  return runAgentStage({ agentName: "delivery", role: "delivery", userPrompt });
}

module.exports = { run };

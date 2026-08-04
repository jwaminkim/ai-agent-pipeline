const { runAgentStage } = require("../lib/runAgentStage");

/** kind: "unit" | "e2e" */
async function run({ kind, target }) {
  const userPrompt = `${kind === "unit" ? "단위" : "통합/E2E"} 테스트를 작성하고 실제로 실행한 뒤, 실행 로그와 커버리지를 evidence로 제출하세요.\n대상: ${JSON.stringify(target)}`;
  return runAgentStage({ agentName: `test-${kind}`, role: "test", userPrompt });
}

module.exports = { run };

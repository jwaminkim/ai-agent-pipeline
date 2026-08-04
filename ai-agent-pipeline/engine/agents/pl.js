const { runAgentStage } = require("../lib/runAgentStage");

async function run({ design, techConstraints }) {
  const isExisting = techConstraints?.project_mode === "existing";
  const outputPath = techConstraints?.output_path
    ? `\n프로젝트 위치: ${techConstraints.output_path} (이 경로 기준으로 작업 배분하세요)`
    : "";
  const modeNote = isExisting
    ? `\n\n기존 프로젝트 수정 건입니다. 인터페이스 계약을 완전히 새로 정의하지 말고, 기존 API/데이터 모델과 호환되는 범위에서 변경 계약만 정의하세요. 기존 코드와 충돌하는 부분이 있으면 그 사실을 명확히 남기세요.`
    : "";
  const userPrompt = `다음 설계를 기준으로 인터페이스 계약(API 스펙, 데이터 모델)을 확정하고 DB→백엔드→프론트 순서로 작업을 배분하세요.\n설계: ${JSON.stringify(design)}\n기술 스택: ${JSON.stringify(techConstraints)}${outputPath}${modeNote}`;
  return runAgentStage({ agentName: "pl", role: "pl", userPrompt });
}

module.exports = { run };

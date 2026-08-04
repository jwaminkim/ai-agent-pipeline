const { runAgentStage } = require("../lib/runAgentStage");

/**
 * filePaths: 업로드된 파일들의 절대경로 배열
 * (내용을 여기서 미리 읽지 않는다 — Claude Code가 자신의 파일 읽기 능력으로 직접 열어서 분석함)
 */
async function run({ filePaths, techConstraints }) {
  if (!filePaths || !filePaths.length) {
    const userPrompt = "요구사항 파일이 업로드되지 않았습니다. status를 needs_clarification으로 응답하고, 파일 업로드가 필요하다고 questions에 남기세요.";
    return runAgentStage({ agentName: "planning", role: "planning", userPrompt });
  }

  const fileList = filePaths.map((p) => `- ${p}`).join("\n");
  const isExisting = techConstraints?.project_mode === "existing";

  const modeNote = isExisting
    ? `\n\n**중요**: 이 파일들은 완전히 새로운 요구사항이 아니라, 이미 존재하는 프로젝트(${techConstraints.output_path})에 대한 "변경 요청"입니다.\n` +
      `요구사항을 처음부터 정의하지 말고, 이 파일들이 요구하는 변경사항이 무엇인지에 집중해서 REQ-ID를 부여하세요. ` +
      `가능하면 먼저 ${techConstraints.output_path} 폴더 구조를 훑어보고, 어떤 기존 기능/모듈에 영향을 주는 변경인지도 파악해서 함께 기록하세요.`
    : "";

  const userPrompt = `다음 파일들을 직접 열어서 읽고 분석하세요. 워드/엑셀/PPT/PDF/텍스트 등 포맷이 섞여 있을 수 있으니, 각 파일 형식에 맞는 방법으로 내용을 파악한 뒤 통합해서 요구사항을 구조화하고 REQ-ID를 부여하세요.\n\n파일 목록:\n${fileList}${modeNote}`;

  return runAgentStage({ agentName: "planning", role: "planning", userPrompt });
}

module.exports = { run };

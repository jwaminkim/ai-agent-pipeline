import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { readJSON, listAgentStatusCards } from "@/lib/state";
import { claudeClient, authCheck } from "@/lib/engineBridge";

const CTO_PROMPT_PATH = path.join(process.cwd(), "..", "engine", "prompts", "cto.md");
const AGENTS_STATE_DIR = path.join(process.cwd(), "..", "state", "agents");
const PIPELINE_CONFIG_PATH = path.join(process.cwd(), "..", "engine", "config", "pipeline.config.json");

function resolveCtoModel(): string | undefined {
  try {
    const config = JSON.parse(fs.readFileSync(PIPELINE_CONFIG_PATH, "utf-8"));
    return config.models?.cto || config.models?.default || undefined;
  } catch {
    return undefined;
  }
}

/** 상태 요약 카드 + 대기 이슈로 CTO에게 줄 컨텍스트를 구성 (원본 히스토리는 기본적으로 포함 안 함) */
function buildContext(message: string) {
  const status = readJSON("pipeline_status.json", { status: "idle", current_stage: null });
  const cards = listAgentStatusCards();
  const issues = readJSON<{ issues: any[] }>("issues/issue_history.json", { issues: [] });
  const pending = issues.issues.filter((i) => i.status === "pending");

  let context = `## 파이프라인 현재 상태\n${JSON.stringify(status)}\n\n`;
  context += `## 에이전트 상태 요약 카드\n${JSON.stringify(cards, null, 2)}\n\n`;
  context += `## 사람 결정 대기 중인 이슈 (${pending.length}건)\n${JSON.stringify(pending, null, 2)}\n`;

  const wantsDetail = /더\s*자세히|자세히/.test(message);
  if (wantsDetail) {
    const mentioned = cards.find((c: any) => message.includes(c.agent));
    if (mentioned) {
      const historyPath = path.join(AGENTS_STATE_DIR, `${mentioned.agent}.history.json`);
      if (fs.existsSync(historyPath)) {
        const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
        const recentTurns = (history.turns || []).slice(-6);
        context += `\n## "${mentioned.agent}" 에이전트 원본 히스토리 최근 발췌\n${JSON.stringify(recentTurns, null, 2)}\n`;
      }
    }
  }
  return context;
}

export async function POST(req: Request) {
  const { message } = await req.json();

  const auth = authCheck.checkClaudeAuth();
  if (!auth.installed) {
    return NextResponse.json({ reply: "⚠ claude 명령을 찾을 수 없습니다. Claude Code CLI를 설치해주세요." });
  }
  if (!auth.loggedIn) {
    return NextResponse.json({ reply: "⚠ Claude Code에 로그인되어 있지 않습니다. 터미널에서 `claude auth login`을 먼저 실행해주세요." });
  }

  const context = buildContext(message);
  if (!fs.existsSync(CTO_PROMPT_PATH)) {
    return NextResponse.json({ reply: "engine/prompts/cto.md 를 찾을 수 없습니다. 프로젝트 구조를 확인해주세요." });
  }
  const ctoSystemPrompt = fs.readFileSync(CTO_PROMPT_PATH, "utf-8") + "\n\n## 지금 참고할 컨텍스트\n" + context;

  try {
    const reply = await claudeClient.callText({ systemPrompt: ctoSystemPrompt, userPrompt: message, model: resolveCtoModel() });
    return NextResponse.json({ reply });
  } catch (err: any) {
    if (err instanceof claudeClient.UsageLimitError) {
      const label = err.limitType === "weekly" ? "주간" : "5시간";
      return NextResponse.json({
        reply: `⚠ ${label} 사용량 한도에 도달했습니다. ${
          err.limitType === "weekly"
            ? "주간 한도는 자동으로 기다리지 않으니, 리셋 후 다시 시도해주세요."
            : "잠시 후(5시간 세션 리셋 후) 다시 시도해주세요."
        }`,
      });
    }
    console.error("[CTO API] 호출 실패:", err);
    return NextResponse.json({ reply: `CTO 호출 중 오류가 발생했습니다: ${err?.message || err}` }, { status: 200 });
  }
}

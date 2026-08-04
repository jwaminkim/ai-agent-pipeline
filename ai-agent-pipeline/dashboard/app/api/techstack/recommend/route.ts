import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { listAgentStatusCards } from "@/lib/state";
import { claudeClient, authCheck } from "@/lib/engineBridge";

const UPLOADS_DIR = path.join(process.cwd(), "..", "state", "uploads");

const RECOMMEND_SYSTEM_PROMPT = `당신은 소프트웨어 아키텍트입니다. 업로드된 요구사항 파일들을 직접 열어서 읽고,
이 프로젝트에 적합한 기술 스택을 추천하세요.

반드시 아래 형식 그대로, 다른 설명 없이 답하세요:
언어: (예: C#, TypeScript, Python 등)
프레임워크: (예: .NET 8.0, .NET Framework 4.8, Node.js/Express, Django 등)
프로젝트 유형: (예: 웹, 데스크톱, 모바일, CLI, API 서버 등)
UI 프레임워크: (예: WPF, WinForms, React, Blazor, 해당없음 등)
ORM/데이터베이스: (예: Entity Framework Core, Prisma, 해당없음 등)
추천 이유: (2~3문장으로 왜 이 조합을 추천하는지)`;

export async function POST() {
  const auth = authCheck.checkClaudeAuth();
  if (!auth.installed) {
    return NextResponse.json({ ok: false, error: "claude 명령을 찾을 수 없습니다." }, { status: 400 });
  }
  if (!auth.loggedIn) {
    return NextResponse.json({ ok: false, error: "Claude Code에 로그인이 필요합니다 (claude auth login)." }, { status: 400 });
  }

  if (!fs.existsSync(UPLOADS_DIR) || !fs.readdirSync(UPLOADS_DIR).filter((f) => !f.startsWith(".")).length) {
    return NextResponse.json({ ok: false, error: "먼저 요구사항 파일을 업로드해주세요." }, { status: 400 });
  }

  const files = fs.readdirSync(UPLOADS_DIR).filter((f) => !f.startsWith("."));
  const fileList = files.map((f) => `- ${path.join(UPLOADS_DIR, f)}`).join("\n");

  // 기획 에이전트가 이미 분석을 끝냈다면 그 결과도 참고 컨텍스트로 함께 제공
  const planningCard = listAgentStatusCards().find((c: any) => c.agent === "planning");
  const planningNote = planningCard ? `\n\n기획 에이전트 분석 결과 요약: ${planningCard.summary}` : "";

  const userPrompt = `다음 파일들을 읽고 기술 스택을 추천하세요:\n${fileList}${planningNote}`;

  try {
    const reply = await claudeClient.callText({ systemPrompt: RECOMMEND_SYSTEM_PROMPT, userPrompt });
    return NextResponse.json({ ok: true, recommendation: reply });
  } catch (err: any) {
    if (err instanceof claudeClient.UsageLimitError) {
      return NextResponse.json({ ok: false, error: "사용량 한도에 도달했습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
    }
    return NextResponse.json({ ok: false, error: err?.message || "추천 요청 중 오류가 발생했습니다." }, { status: 500 });
  }
}

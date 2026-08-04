import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { readJSON, writeJSON } from "@/lib/state";

const PIPELINE_CONFIG_PATH = path.join(process.cwd(), "..", "engine", "config", "pipeline.config.json");

export async function GET() {
  const config = JSON.parse(fs.readFileSync(PIPELINE_CONFIG_PATH, "utf-8"));
  // enabled_stages는 pipeline_status.json과 별도 파일에서 관리 (엔진이 진행상태를 갱신하는 파일과
  // 동시에 read-modify-write 하면서 한쪽 변경이 유실되는 경합 조건을 막기 위함)
  const selection = readJSON("agent_selection.json", { enabled_stages: [] as string[] });
  return NextResponse.json({ config, enabledStages: selection.enabled_stages || [] });
}

// 사람이 프리셋을 고르거나 커스텀 체크박스를 조정하면 agent_selection.json에 반영
export async function POST(req: Request) {
  const body = await req.json();
  const { enabledStages } = body as { enabledStages: string[] };
  writeJSON("agent_selection.json", { enabled_stages: enabledStages });
  return NextResponse.json({ ok: true });
}

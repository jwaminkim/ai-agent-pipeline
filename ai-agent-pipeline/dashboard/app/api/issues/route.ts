import { NextResponse } from "next/server";
import { readJSON, writeJSON } from "@/lib/state";

type Issue = {
  id: string;
  at: string;
  stage: string;
  requirement_ids: string[];
  classification: "bug" | "design" | "requirement";
  status: "resolved" | "pending" | "decided";
  title: string;
  description: string;
  resolution: string | null;
  reasoning?: string | null;
  decided_at?: string;
};

export async function GET() {
  const data = readJSON<{ issues: Issue[] }>("issues/issue_history.json", { issues: [] });
  return NextResponse.json(data);
}

// 사람이 "사람 결정 대기" 이슈에 결정을 입력할 때 사용
export async function POST(req: Request) {
  const body = await req.json();
  const { issueId, decisionText } = body as { issueId: string; decisionText: string };

  const data = readJSON<{ issues: Issue[] }>("issues/issue_history.json", { issues: [] });
  const next = {
    issues: data.issues.map((it) =>
      it.id === issueId
        ? { ...it, status: "decided" as const, resolution: decisionText, decided_at: new Date().toISOString() }
        : it
    ),
  };
  writeJSON("issues/issue_history.json", next);
  return NextResponse.json({ ok: true });
}

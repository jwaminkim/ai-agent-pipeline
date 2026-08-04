import { NextResponse } from "next/server";
import { readJSON, writeJSON } from "@/lib/state";

type Approvals = { requirements: boolean; design: boolean; delivery: boolean; [k: string]: boolean };

export async function GET() {
  const approvals = readJSON<Approvals>("approvals.json", {
    requirements: false,
    design: false,
    delivery: false,
  });
  return NextResponse.json(approvals);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { checkpoint } = body as { checkpoint: string };
  const approvals = readJSON<Approvals>("approvals.json", {
    requirements: false,
    design: false,
    delivery: false,
  });
  approvals[checkpoint] = true;
  writeJSON("approvals.json", approvals);
  return NextResponse.json({ ok: true, approvals });
}

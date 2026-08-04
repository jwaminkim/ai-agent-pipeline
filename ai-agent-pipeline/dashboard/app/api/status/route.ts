import { NextResponse } from "next/server";
import { readJSON } from "@/lib/state";

export async function GET() {
  const pipelineStatus = readJSON("pipeline_status.json", {});
  const usage = readJSON("usage.json", {
    checked_at: null,
    source: "not_checked",
    last_5h: { input_tokens: 0, output_tokens: 0, message_count: 0, earliest_ts: null },
    last_7d: { input_tokens: 0, output_tokens: 0, message_count: 0, earliest_ts: null },
    note: null,
    plan_pct: null,
  });
  return NextResponse.json({ pipelineStatus, usage });
}

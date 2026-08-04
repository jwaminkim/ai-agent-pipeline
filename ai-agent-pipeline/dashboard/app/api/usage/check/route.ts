import { NextResponse } from "next/server";
import { usageMonitor } from "@/lib/engineBridge";

// checkAndSaveUsageOnce()가 state/usage.json 저장까지 알아서 처리함 (엔진과 동일한 함수)
export async function POST() {
  const usage = await usageMonitor.checkAndSaveUsageOnce();
  return NextResponse.json(usage);
}

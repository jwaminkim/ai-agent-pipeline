import { NextResponse } from "next/server";
import { readJSON } from "@/lib/state";

export async function GET() {
  const data = readJSON("knowledge/patterns.json", { patterns: [] });
  return NextResponse.json(data);
}

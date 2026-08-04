import { NextResponse } from "next/server";
import { listAgentStatusCards } from "@/lib/state";

export async function GET() {
  const cards = listAgentStatusCards();
  return NextResponse.json({ agents: cards });
}

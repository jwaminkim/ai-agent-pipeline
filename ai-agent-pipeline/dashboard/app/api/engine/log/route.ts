import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "..", "state", "engine.log");

export async function GET() {
  if (!fs.existsSync(LOG_FILE)) return NextResponse.json({ log: "" });
  const content = fs.readFileSync(LOG_FILE, "utf-8");
  const lines = content.split("\n");
  const tail = lines.slice(-200).join("\n"); // 최근 200줄만
  return NextResponse.json({ log: tail });
}

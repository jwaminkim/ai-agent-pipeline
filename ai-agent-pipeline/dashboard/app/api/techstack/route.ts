import { NextResponse } from "next/server";
import { readJSON, writeJSON } from "@/lib/state";

export type TechStack = {
  project_mode: "new" | "existing";
  language: string | null;
  framework: string | null;
  project_type: string | null;
  ui_framework: string | null;
  orm: string | null;
  output_path: string | null;
  reference_paths: string[];
  notes: string | null;
};

const DEFAULT: TechStack = {
  project_mode: "new",
  language: null,
  framework: null,
  project_type: null,
  ui_framework: null,
  orm: null,
  output_path: null,
  reference_paths: [],
  notes: null,
};

export async function GET() {
  const data = readJSON<TechStack>("tech_stack.json", DEFAULT);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<TechStack>;
  const current = readJSON<TechStack>("tech_stack.json", DEFAULT);
  const next = { ...current, ...body };
  writeJSON("tech_stack.json", next);
  return NextResponse.json({ ok: true, techStack: next });
}

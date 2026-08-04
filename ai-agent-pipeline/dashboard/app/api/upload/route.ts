import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "..", "state", "uploads");

export async function GET() {
  if (!fs.existsSync(UPLOADS_DIR)) return NextResponse.json({ files: [] });
  const files = fs.readdirSync(UPLOADS_DIR).filter((f) => !f.startsWith("."));
  return NextResponse.json({ files });
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (!files.length) {
    return NextResponse.json({ ok: false, error: "업로드된 파일이 없습니다." }, { status: 400 });
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const saved: string[] = [];

  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[/\\]/g, "_");
    fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buf);
    saved.push(safeName);
  }

  return NextResponse.json({ ok: true, saved });
}

export async function DELETE(req: Request) {
  const { filename } = await req.json();
  const target = path.join(UPLOADS_DIR, filename.replace(/[/\\]/g, "_"));
  if (fs.existsSync(target)) fs.unlinkSync(target);
  return NextResponse.json({ ok: true });
}

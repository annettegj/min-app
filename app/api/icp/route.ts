import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const content = fs.readFileSync(path.join(process.cwd(), "config", "icp.md"), "utf-8");
  return NextResponse.json({ content });
}

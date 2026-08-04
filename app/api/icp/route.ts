import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const dir = path.join(process.cwd(), "config");
  const eu = fs.readFileSync(path.join(dir, "icp.md"), "utf-8");
  let us = "";
  try { us = fs.readFileSync(path.join(dir, "icp_us.md"), "utf-8"); } catch { /* optional */ }
  // `content` kept for backward compatibility (= the European ICP).
  return NextResponse.json({ content: eu, eu, us });
}

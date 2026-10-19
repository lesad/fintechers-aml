import { NextResponse } from "next/server";

// The "genuinely need a Route Handler" example (health/webhook). The template
// otherwise prefers Server Actions for mutations (ADR-0005).
export function GET() {
  return NextResponse.json({ status: "ok" });
}

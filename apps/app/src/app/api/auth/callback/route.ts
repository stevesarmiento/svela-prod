import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/";

  // Convex Auth handles OAuth callbacks internally
  // This route is kept for backward compatibility
  return NextResponse.redirect(`${origin}${next}`);
}

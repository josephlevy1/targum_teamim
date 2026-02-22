import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const withClerk = clerkMiddleware();
const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

function isDashboardOpsRoute(pathname: string): boolean {
  return pathname === "/manuscripts/dashboard" || pathname.startsWith("/api/manuscripts/dashboard");
}

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!clerkConfigured) {
    return NextResponse.next();
  }

  // Keep ops dashboard unauthenticated for wallboard-style monitoring use.
  if (isDashboardOpsRoute(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return withClerk(request, event);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"],
};

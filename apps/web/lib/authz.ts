import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

export class AuthzError extends Error {
  constructor(public readonly code: "AUTH_REQUIRED" | "AUTH_UNAVAILABLE", message: string) {
    super(message);
  }
}

export interface EditorUser {
  userId: string;
  username: string;
}

function clerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

function usernameFromUser(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>): string {
  if (user.username && user.username.trim()) {
    return user.username.trim();
  }

  const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
  if (primaryEmail?.emailAddress) {
    const localPart = primaryEmail.emailAddress.split("@")[0]?.trim();
    if (localPart) return localPart;
  }

  return `user_${user.id.slice(0, 8)}`;
}

export async function requireEditorUser(): Promise<EditorUser> {
  if (!clerkConfigured()) {
    throw new AuthzError("AUTH_UNAVAILABLE", "Authentication is not configured.");
  }

  const { userId } = await auth();
  if (!userId) {
    throw new AuthzError("AUTH_REQUIRED", "Login required to save edits.");
  }

  const user = await currentUser();
  if (!user) {
    throw new AuthzError("AUTH_REQUIRED", "Login required to save edits.");
  }

  return {
    userId,
    username: usernameFromUser(user),
  };
}

export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthzError) {
    if (error.code === "AUTH_REQUIRED") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error.code === "AUTH_UNAVAILABLE") {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
  }
  return null;
}

"use client";

import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export function AuthControls() {
  return (
    <div className="auth-controls" aria-label="Authentication controls">
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="subtle">Log in</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button">Sign up</button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  );
}

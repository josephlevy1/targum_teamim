import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Targum Ta'amim Editor",
  description: "Verse-by-verse ta'amim transposition and correction workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

  return (
    <html lang="en">
      <body>
        {clerkConfigured ? (
          <ClerkProvider
            appearance={{
              variables: {
                colorPrimary: "#005f73",
                colorText: "#111111",
                colorTextSecondary: "#6a5f53",
                colorBackground: "#fffdf8",
                colorInputBackground: "#fffdf8",
                colorInputText: "#111111",
                colorNeutral: "#ddd3c2",
                borderRadius: "10px",
              },
              elements: {
                userButtonTrigger: "auth-user-trigger",
                userButtonAvatarBox: "auth-user-avatar",
                userButtonPopoverCard: "auth-user-popover",
                userButtonPopoverActionButton: "auth-user-action",
              },
            }}
          >
            {children}
          </ClerkProvider>
        ) : (
          <>
            {children}
          </>
        )}
      </body>
    </html>
  );
}

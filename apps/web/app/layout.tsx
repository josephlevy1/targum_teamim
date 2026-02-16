import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Targum Ta'amim Editor",
  description: "Verse-by-verse ta'amim transposition and correction workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "News Analysis",
  description: "Search recent news, generate an AI summary + sentiment, and browse past analyses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/">Search</Link>
          <Link href="/history">History</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}

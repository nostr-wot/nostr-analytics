import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import LoginButton from "./components/LoginButton";

const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Nostr Analytics",
  description: "Nostr event analytics and collection dashboard",
  robots: { index: true, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100`}
      >
        <AuthProvider>
          <nav className="border-b border-zinc-800 px-6 py-4">
            <div className="mx-auto flex max-w-6xl items-center justify-between">
              <div className="flex items-center gap-6">
                <a href="/" className="text-lg font-semibold text-white">
                  Nostr Analytics
                </a>
                <a
                  href="/relays"
                  className="text-sm text-zinc-400 transition-colors hover:text-white"
                >
                  Relays
                </a>
              </div>
              <LoginButton />
            </div>
          </nav>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}

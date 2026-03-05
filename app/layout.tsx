import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import LoginButton from "./components/LoginButton";

const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Nostr WoT Analytics",
  description: "Monitor relay health and analyze npub behavior across the Nostr network",
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
                <a href="/" className="flex items-baseline gap-1.5 text-lg font-semibold text-white">
                  Nostr WoT
                  <span className="text-sm font-medium text-zinc-400">Analytics</span>
                </a>
                <a
                  href="/npubs"
                  className="text-sm text-zinc-400 transition-colors hover:text-white"
                >
                  Npubs
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
          <footer className="mt-16 border-t border-zinc-800 bg-zinc-950">
            <div className="mx-auto max-w-6xl px-6 py-10">
              <div className="grid gap-8 sm:grid-cols-3">
                {/* Brand */}
                <div className="space-y-3">
                  <a href="/" className="flex items-baseline gap-1.5 text-lg font-semibold text-white">
                    Nostr WoT
                    <span className="text-sm font-medium text-zinc-400">Analytics</span>
                  </a>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    Monitor relay health and analyze npub behavior across the
                    Nostr network.
                  </p>
                </div>
                {/* Navigation */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-300">Product</h3>
                  <ul className="space-y-2 text-sm">
                    <li><a href="/npubs" className="text-zinc-500 transition-colors hover:text-white">Npubs</a></li>
                    <li><a href="/relays" className="text-zinc-500 transition-colors hover:text-white">Relays</a></li>
                    <li><a href="https://nostr-wot.com" className="text-zinc-500 transition-colors hover:text-white" target="_blank" rel="noopener noreferrer">Nostr WoT</a></li>
                  </ul>
                </div>
                {/* Resources */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-300">Resources</h3>
                  <ul className="space-y-2 text-sm">
                    <li>
                      <a href="https://github.com/nostr-wot/nostr-analytics" className="text-zinc-500 transition-colors hover:text-white" target="_blank" rel="noopener noreferrer">
                        GitHub
                      </a>
                    </li>
                    <li><a href="https://nostr-wot.com/docs" className="text-zinc-500 transition-colors hover:text-white" target="_blank" rel="noopener noreferrer">Documentation</a></li>
                  </ul>
                </div>
              </div>
              <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-zinc-800/50 pt-6 sm:flex-row">
                <p className="text-xs text-zinc-600">
                  &copy; {new Date().getFullYear()} Nostr WoT. Open source under MIT License.
                </p>
                <div className="flex items-center gap-4">
                  <a
                    href="https://github.com/nostr-wot/nostr-analytics"
                    className="text-zinc-600 transition-colors hover:text-white"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="GitHub"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  </a>
                  <a
                    href="https://njump.me/npub1gxdhmu9swqduwhr6zptjy4ya693zp3ql28nemy4hd97kuufyrqdqwe5zfk"
                    className="text-zinc-600 transition-colors hover:text-white"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Nostr"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm3.5 14.5c-1.5 1-3.5 1.5-5.5.5s-3-3-2.5-5 2.5-3.5 4.5-3 3.5 2 3.5 4-.5 2.5-1.5 3.5z"/></svg>
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { UserMenu } from "@/components/UserMenu";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "EVChargePress — find EV charging stations", template: "%s · EVChargePress" },
  description: "Find EV charging stations, check live driver reports, and add new chargers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white">⚡</span>
              EVChargePress
            </Link>
            <nav className="flex items-center gap-2 sm:gap-4">
              <Link href="/map" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">
                Map
              </Link>
              <Link href="/bookings" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">
                Bookings
              </Link>
              <Link href="/stations/new" className="hidden text-sm font-medium text-zinc-600 sm:inline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">
                + Add station
              </Link>
              <Suspense fallback={<span className="h-8 w-16" />}>
                <UserMenu />
              </Suspense>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-zinc-200 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
          EVChargePress MVP · Station data from drivers and © OpenStreetMap contributors (ODbL)
        </footer>
      </body>
    </html>
  );
}

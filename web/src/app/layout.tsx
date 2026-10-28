import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { AdminSidebarLinks } from "@/components/admin/AdminSidebarLinks";
import { BottomNav, SidebarNav } from "@/components/nav/AppNav";
import { UserMenu } from "@/components/UserMenu";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "EVChargePress — find and book EV charging", template: "%s · EVChargePress" },
  description: "Find EV charging stations, check compatibility and prices, and book a charging slot.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-energy-600 text-white">⚡</span>
      EVChargePress
    </Link>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow">
          Skip to content
        </a>
        <div className="md:grid md:min-h-screen md:grid-cols-[15rem_1fr]">
          {/* Desktop sidebar */}
          <aside className="hidden border-r border-zinc-200 bg-white px-3 py-4 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:gap-6 md:overflow-y-auto dark:border-zinc-800 dark:bg-zinc-950">
            <div className="px-2"><Logo /></div>
            <SidebarNav />
            <Suspense fallback={null}>
              <AdminSidebarLinks />
            </Suspense>
            <div className="mt-auto">
              <Suspense fallback={null}>
                <UserMenu />
              </Suspense>
            </div>
          </aside>

          <div className="flex min-h-screen flex-col">
            {/* Mobile top bar */}
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/90">
              <Logo />
              <Suspense fallback={null}>
                <UserMenu compact />
              </Suspense>
            </header>
            <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
              {children}
            </main>
            <footer className="hidden border-t border-zinc-200 px-8 py-5 text-xs text-zinc-500 md:block dark:border-zinc-800">
              EVChargePress MVP · Station data from drivers and © OpenStreetMap contributors (ODbL) · Prices at demo stations are examples
            </footer>
          </div>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}

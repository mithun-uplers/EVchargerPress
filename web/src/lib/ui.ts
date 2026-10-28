/**
 * Shared class names for the energy design system. Plain strings in a non-client module, so both
 * server and client components get the real values.
 */
export const ui = {
  card: "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 sm:p-5 dark:bg-zinc-900 dark:ring-zinc-800",
  cardFlat: "rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800",
  hero: "relative overflow-hidden rounded-3xl bg-gradient-to-br from-energy-700 via-energy-600 to-energy-800 p-5 text-white shadow-md sm:p-6",
  input:
    "mt-1 block w-full min-h-11 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-energy-600 focus:outline-none focus:ring-4 focus:ring-energy-600/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100",
  btn: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-energy-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-energy-700 disabled:opacity-60",
  btnLight: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm ring-1 ring-inset ring-zinc-200 transition hover:bg-energy-50 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800",
  btnOnDark: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-energy-800 shadow-sm transition hover:bg-energy-50",
  error: "rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  ok: "rounded-xl bg-energy-50 px-3 py-2 text-sm text-energy-800 ring-1 ring-inset ring-energy-200 dark:bg-energy-500/10 dark:text-energy-300 dark:ring-energy-500/30",
  link: "font-medium text-energy-700 hover:underline dark:text-energy-400",
  pill: "rounded-full px-2.5 py-0.5 text-xs font-medium",
} as const;

import type { Metadata } from "next";
import Link from "next/link";
import { signIn, signUp } from "@/app/actions";

export const metadata: Metadata = { title: "Sign in" };

const input = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const signup = s("mode") === "signup";
  const next = s("next") || "/";

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{signup ? "Create an account" : "Sign in"}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {signup ? "Report charger status and add stations." : "Welcome back to EVChargePress."}
      </p>
      {s("error") && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{s("error")}</p>}
      {s("message") && <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">{s("message")}</p>}

      <form action={signup ? signUp : signIn} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        {signup && (
          <label className="block text-sm font-medium">
            Display name
            <input name="display_name" maxLength={40} className={input} />
          </label>
        )}
        <label className="block text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" className={input} />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input name="password" type="password" required minLength={8} autoComplete={signup ? "new-password" : "current-password"} className={input} />
        </label>
        {!signup && (
          <p className="-mt-2 text-right text-sm">
            <Link href="/forgot-password" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Forgot password?
            </Link>
          </p>
        )}
        <button className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">
          {signup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        {signup ? "Already have an account? " : "New here? "}
        <Link
          href={`/login?${new URLSearchParams({ ...(signup ? {} : { mode: "signup" }), next })}`}
          className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}

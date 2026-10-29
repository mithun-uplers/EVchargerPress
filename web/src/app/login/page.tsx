import type { Metadata } from "next";
import Link from "next/link";
import { signIn, signUp } from "@/app/actions";
import { AuthShell } from "@/components/AuthShell";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const signup = s("mode") === "signup";
  const next = s("next") || "/";
  const tab = (active: boolean) =>
    `flex-1 rounded-lg py-2 text-center text-sm font-medium transition ${active ? "bg-white text-energy-800 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"}`;

  return (
    <AuthShell
      title={signup ? "Create your account" : "Welcome back"}
      subtitle={signup ? "Add your vehicle, book chargers and track your charging." : "Sign in to book chargers and see your charging."}
      footer={
        <>
          By continuing you agree to use EVChargePress responsibly. Station data from drivers and © OpenStreetMap contributors.
        </>
      }
    >
      <nav aria-label="Account" className="mb-5 flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-950">
        <Link href={`/login?${new URLSearchParams({ next })}`} aria-current={!signup ? "page" : undefined} className={tab(!signup)}>Sign in</Link>
        <Link href={`/login?${new URLSearchParams({ mode: "signup", next })}`} aria-current={signup ? "page" : undefined} className={tab(signup)}>Create account</Link>
      </nav>
      {s("error") && <p className={`mb-4 ${ui.error}`}>{s("error")}</p>}
      {s("message") && <p className={`mb-4 ${ui.ok}`}>{s("message")}</p>}

      <form action={signup ? signUp : signIn} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        {signup && (
          <label className="block text-sm font-medium">
            Display name
            <input name="display_name" maxLength={40} autoComplete="nickname" className={ui.input} />
          </label>
        )}
        <label className="block text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" className={ui.input} />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input name="password" type="password" required minLength={8} autoComplete={signup ? "new-password" : "current-password"} className={ui.input} />
          {signup && <span className="mt-1 block text-xs font-normal text-zinc-500">At least 8 characters.</span>}
        </label>
        {!signup && (
          <p className="-mt-2 text-right text-sm">
            <Link href="/forgot-password" className={ui.link}>Forgot password?</Link>
          </p>
        )}
        <button className={`${ui.btn} w-full`}>{signup ? "Create account" : "Sign in"}</button>
      </form>
      {signup && <p className="mt-4 text-xs text-zinc-500">You’re signed in straight away after creating your account.</p>}
    </AuthShell>
  );
}

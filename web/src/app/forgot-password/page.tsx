import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions";

export const metadata: Metadata = { title: "Forgot password" };

const input = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const sp = await searchParams;
  const sent = sp.sent === "1";
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      {sent ? (
        <div className="mt-4 rounded-md bg-energy-50 px-3 py-3 text-sm text-energy-800 dark:bg-energy-500/10 dark:text-energy-300">
          If an account exists for that email, we’ve sent a link to reset the password. It expires in 1 hour. Check your spam folder if it doesn’t arrive.
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-zinc-500">Enter your account email and we’ll send you a reset link.</p>
          {error && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <form action={requestPasswordReset} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Email
              <input name="email" type="email" required autoComplete="email" className={input} />
            </label>
            <button className="w-full rounded-lg bg-energy-600 py-2.5 text-sm font-medium text-white hover:bg-energy-700">Send reset link</button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm text-zinc-500">
        <Link href="/login" className="font-medium text-energy-700 hover:underline dark:text-energy-400">Back to sign in</Link>
      </p>
    </div>
  );
}

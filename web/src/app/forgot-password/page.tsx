import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions";
import { AuthShell } from "@/components/AuthShell";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const sp = await searchParams;
  const sent = sp.sent === "1";
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <AuthShell
      title="Reset your password"
      subtitle={sent ? undefined : "Enter your account email and we’ll send you a reset link."}
      footer={<Link href="/login" className={ui.link}>Back to sign in</Link>}
    >
      {sent ? (
        <div className={ui.ok}>
          If an account exists for that email, we’ve sent a link to reset the password. It expires in 1 hour. Check your spam folder if it doesn’t arrive.
        </div>
      ) : (
        <>
          {error && <p className={`mb-4 ${ui.error}`}>{error}</p>}
          <form action={requestPasswordReset} className="space-y-4">
            <label className="block text-sm font-medium">
              Email
              <input name="email" type="email" required autoComplete="email" className={ui.input} />
            </label>
            <button className={`${ui.btn} w-full`}>Send reset link</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

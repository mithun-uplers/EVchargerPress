"use client";

import { useActionState, useState } from "react";
import { createUserAction, deleteUserAction, setPasswordAction, updateUserAction, type DeleteState, type UserFormState } from "@/app/admin/user-actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { ui } from "@/lib/ui";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function generatePassword(length = 14) {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  let pw = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  if (!/\d/.test(pw)) pw = pw.slice(0, -1) + String(bytes[0] % 10);
  return pw;
}

/** Password + confirm, with show/hide and a generator. Values stay in the browser until submitted. */
function PasswordFields({ label = "Password" }: { label?: string }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          {label}
          <input name="password" type={show ? "text" : "password"} required minLength={8} maxLength={72} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={ui.input} />
        </label>
        <label className="text-sm font-medium">
          Confirm {label.toLowerCase()}
          <input name="confirm" type={show ? "text" : "password"} required minLength={8} maxLength={72} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={ui.input} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            const g = generatePassword();
            setPw(g);
            setConfirm(g);
            setShow(true);
          }}
          className={ui.btnLight}
        >
          Generate a strong password
        </button>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-5 w-5 accent-energy-600" />
          Show password
        </label>
      </div>
      <p className="text-xs text-zinc-500">At least 8 characters with letters and a number. Share it with the person privately (not by email in plain text if you can avoid it).</p>
    </div>
  );
}

function RequireChange({ defaultChecked = true }: { defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-11 items-start gap-3 text-sm">
      <input type="checkbox" name="require_change" defaultChecked={defaultChecked} className="mt-0.5 h-5 w-5 accent-energy-600" />
      <span>
        <span className="font-medium">Ask them to choose their own password at first sign-in</span>
        <span className="block text-xs text-zinc-500">Recommended, so only they know it.</span>
      </span>
    </label>
  );
}

export function CreateUserForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(createUserAction, null);
  const v = state?.values ?? {};
  return (
    <form action={action} className="space-y-5">
      <fieldset disabled={disabled} className={`${ui.card} space-y-4 disabled:opacity-60`}>
        <legend className="sr-only">Account</legend>
        <h2 className="font-semibold">Account</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">
            Email
            <input name="email" type="email" required autoComplete="off" defaultValue={v.email} className={ui.input} />
            <span className="mt-0.5 block text-xs font-normal text-zinc-500">The account is confirmed straight away — no verification email is sent.</span>
          </label>
          <label className="text-sm font-medium">
            Name
            <input name="display_name" required maxLength={80} defaultValue={v.display_name} className={ui.input} />
          </label>
          <label className="text-sm font-medium">
            Phone (optional)
            <input name="phone" type="tel" inputMode="tel" placeholder="+919876543210" defaultValue={v.phone} className={ui.input} />
          </label>
        </div>
        <PasswordFields />
        <RequireChange />
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" name="make_admin" className="mt-0.5 h-5 w-5 accent-energy-600" />
          <span>
            <span className="font-medium">Make this person an admin</span>
            <span className="block text-xs text-zinc-500">Admins can manage stations, bookings and every user. Leave unticked for a normal driver.</span>
          </span>
        </label>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}

export function EditUserForm({ user }: { user: { id: string; email: string; display_name: string | null; phone: string | null } }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(updateUserAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="user_id" value={user.id} />
      <input type="hidden" name="current_email" value={user.email} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">
          Email
          <input name="email" type="email" required defaultValue={user.email} className={ui.input} />
          <span className="mt-0.5 block text-xs font-normal text-zinc-500">Changing it takes effect immediately, without a confirmation email.</span>
        </label>
        <label className="text-sm font-medium">
          Name
          <input name="display_name" required maxLength={80} defaultValue={user.display_name ?? ""} className={ui.input} />
        </label>
        <label className="text-sm font-medium">
          Phone
          <input name="phone" type="tel" inputMode="tel" defaultValue={user.phone ?? ""} placeholder="+919876543210" className={ui.input} />
        </label>
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Save changes</SubmitButton>
    </form>
  );
}

export function SetPasswordForm({ userId, disabled }: { userId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<UserFormState, FormData>(setPasswordAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="user_id" value={userId} />
      <fieldset disabled={disabled} className="space-y-3 disabled:opacity-60">
        <PasswordFields key={state?.ok ?? "pw"} label="New password" />
        <RequireChange />
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton pending={pending} variant="secondary">Set new password</SubmitButton>
    </form>
  );
}

/** Typed-confirmation delete form: the button stays disabled until the email matches. */
export function DeleteUserForm({ userId, email }: { userId: string; email: string }) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteUserAction, null);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="user_id" value={userId} />
      <label className="block text-sm font-medium">
        Reason (kept in the audit log)
        <input name="reason" maxLength={300} placeholder="Asked to close their account" className={ui.input} />
      </label>
      <label className="block text-sm font-medium">
        Type <span className="select-all font-mono text-rose-700 dark:text-rose-300">{email}</span> to confirm
        <input name="confirm_email" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} className={ui.input} />
      </label>
      <FormMessage state={state} />
      <button
        disabled={!matches || pending}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete account permanently"}
      </button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium text-zinc-700" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Sending..." : "Email me a sign-in link"}
      </button>
      {state.message && (
        <p className={`text-sm ${state.status === "error" ? "text-red-600" : "text-zinc-600"}`}>{state.message}</p>
      )}
    </form>
  );
}

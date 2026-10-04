import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_allowed: "That account isn't on the allowlist.",
  link: "That sign-in link is invalid or expired. Request a new one.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Job Finder</h1>
        <p className="mb-5 text-sm text-zinc-500">Sign in with a magic link.</p>
        {message && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
        <LoginForm />
      </div>
    </main>
  );
}

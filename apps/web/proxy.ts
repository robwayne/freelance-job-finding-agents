import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed } from "./lib/allowlist";

const PUBLIC_PATHS = ["/login", "/auth/"];

/** Refreshes the Supabase session cookie and blocks every route for anyone not on the allowlist. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return new NextResponse("Auth is not configured (SUPABASE_URL / SUPABASE_ANON_KEY).", { status: 500 });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p));

  if (!isPublic && !isAllowed(email)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = email ? "?error=not_allowed" : "";
    const redirect = NextResponse.redirect(login);
    if (email) {
      // Signed in but not allowlisted: clear the session.
      await supabase.auth.signOut();
      for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    }
    return redirect;
  }
  if (path === "/login" && isAllowed(email)) {
    return NextResponse.redirect(new URL("/jobs", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

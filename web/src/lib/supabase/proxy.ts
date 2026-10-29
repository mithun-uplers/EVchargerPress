import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Without these the whole site fails with a bare 500; say what is missing instead.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return new NextResponse(
      "EVChargePress isn't configured yet: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "(Vercel → Project → Settings → Environment Variables), then redeploy.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  // Refreshes the auth token if needed. Do not remove.
  const { data } = await supabase.auth.getClaims();

  // An admin created this account (or set its password): the person must choose their own first.
  const appMeta = data?.claims?.app_metadata as { password_change_required?: boolean } | undefined;
  const path = request.nextUrl.pathname;
  const allowed = path === "/reset-password" || path.startsWith("/auth") || path.startsWith("/api") || path === "/login";
  if (appMeta?.password_change_required === true && !allowed) {
    const url = request.nextUrl.clone();
    url.pathname = "/reset-password";
    url.search = "?required=1";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

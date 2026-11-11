import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed Middleware to Proxy — same file convention and API,
// see node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
//
// This is an *optimistic* check only (reads the session cookie, doesn't hit
// the database) — it exists to redirect signed-out visitors before any page
// renders, for UX, not as the security boundary. The real enforcement is
// RLS + fetchCurrentAthlete() throwing with no session (see
// lib/data/supabase-helpers.ts and FRONTEND_INTEGRATION.md): even if a route
// somehow rendered without this check running, it couldn't read or write
// anything meaningful without a valid session.
// Sign-in is Anonymous Sign-In plus a sign-up / sign-in-by-phone RPC from a
// single client-rendered page — no separate callback route to allow-list.
//
// Also public: PWA plumbing that must be fetchable with no session at all.
// /manifest.webmanifest is what the browser reads to decide installability
// — redirecting it to an HTML login page instead of JSON breaks that
// entirely. /sw.js is registered via a plain fetch
// (navigator.serviceWorker.register) that expects a JS response, not a
// redirect. /offline is precached by the service worker itself at install
// time — if that fetch got redirected to /login, the cache would end up
// storing the login page under the /offline key instead of the real one.
const PUBLIC_PATHS = ["/login", "/manifest.webmanifest", "/sw.js", "/offline"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() (not getSession()) — it revalidates against Supabase Auth
  // rather than trusting the cookie's contents alone, which also means it
  // refreshes an expiring access token and writes the new one back via
  // setAll above, keeping "session persists across refresh" true.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublicPath) {
    // Remember where they were headed (e.g. an invite link) so /login can
    // send them back after sign-in.
    const loginUrl = new URL("/login", request.url);
    const { pathname, search } = request.nextUrl;
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // Deliberately no "signed-in users get redirected away from /login" rule
  // here. An anonymous session can exist without a claimed athlete (e.g. an
  // abandoned claim attempt), and fetchCurrentAthlete() sends those sessions
  // back to /login to finish — redirecting them straight back to "/" here
  // would bounce forever between the two. A fully claimed user who
  // navigates to /login by mistake just sees the roster again, which is
  // harmless.

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

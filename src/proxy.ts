import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Next.js 16 calls this Proxy; it is what earlier versions called Middleware.
 *
 * It exists because server components cannot write cookies. Supabase refreshes
 * the session here, on every request, and writes the rotated tokens onto the
 * response — without it, sessions expire in ways that are very hard to debug.
 *
 * The redirect below is an optimistic check, not the security boundary. The
 * boundary is row-level security plus the allow-list at the callback.
 */

/** Paths a signed-out visitor may reach. */
const PUBLIC_PREFIXES = ["/sign-in", "/auth"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const client = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must never be cached by a CDN, or one
        // trainer's session token can be served to another.
        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // Must happen before the response is generated, so a refresh completed here
  // can still be written to it.
  const {
    data: { user },
  } = await client.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

  if (!user && !isPublic) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = "";
    return NextResponse.redirect(signIn);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image files — those carry no session
     * and running the refresh on them is pure cost.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

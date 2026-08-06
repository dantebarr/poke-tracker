import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotAllowListedError } from "@/lib/trainer/errors";
import { ensureTrainerForSession } from "@/lib/trainer/session";

/**
 * Where Google sends the trainer back to. This is the allow-list's only
 * enforcement point, and the only place a trainer record is created.
 *
 * An account that fails the allow-list is signed straight back out here, so it
 * leaves with no session and no trainer record — and therefore no data. The app
 * being on the public internet does not make it public.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error_description");

  if (providerError) {
    return NextResponse.redirect(
      destination(request, `/sign-in?error=${encodeURIComponent(providerError)}`),
    );
  }
  if (!code) {
    return NextResponse.redirect(destination(request, "/sign-in?error=missing_code"));
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      destination(request, `/sign-in?error=${encodeURIComponent(error.message)}`),
    );
  }

  try {
    await ensureTrainerForSession();
  } catch (thrown) {
    // Whatever went wrong, the session does not survive it. Signing out here is
    // what makes rejection stick: the browser leaves holding no credentials.
    await client.auth.signOut();

    if (thrown instanceof NotAllowListedError) {
      return NextResponse.redirect(destination(request, "/sign-in?error=not_allow_listed"));
    }
    throw thrown;
  }

  return NextResponse.redirect(destination(request, "/"));
}

/**
 * Builds an absolute URL for the redirect. `request.url` is the internal origin
 * once the app is behind Vercel's proxy, so the forwarded host is preferred
 * where present.
 */
function destination(request: NextRequest, path: string): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedHost && process.env.NODE_ENV === "production") {
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${forwardedProto}://${forwardedHost}${path}`;
  }
  return new URL(path, url.origin).toString();
}

import { NextResponse, type NextRequest } from "next/server";

import {
  RETURN_PATH_COOKIE,
  safeReturnPath,
} from "@/lib/auth/return-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { completeSignIn } from "@/lib/trainer/sign-in";

/**
 * Where Google sends the trainer back to.
 *
 * A route handler rather than a server action because Google arrives here by
 * GET redirect — a server action cannot be the target of one. The write itself
 * still goes through the `ensureTrainer` action, reached via `completeSignIn`,
 * so this file stays URL handling and nothing else.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error_description");

  if (providerError) {
    return NextResponse.redirect(signInWithError(request, providerError));
  }
  if (!code) {
    return NextResponse.redirect(signInWithError(request, "missing_code"));
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(signInWithError(request, error.message));
  }

  const outcome = await completeSignIn();
  const returnTo = request.cookies.get(RETURN_PATH_COOKIE)?.value;

  switch (outcome.status) {
    case "signed-in": {
      // Back to where the trainer was headed when sign-in interrupted them —
      // the consent page, when Claude sent them.
      return forgettingReturnPath(
        NextResponse.redirect(absoluteUrl(request, safeReturnPath(returnTo))),
      );
    }
    case "rejected":
      return forgettingReturnPath(
        NextResponse.redirect(signInWithError(request, "not_allow_listed")),
      );
    case "failed":
      return forgettingReturnPath(NextResponse.redirect(signInWithError(request, "unavailable")));
  }
}

/** Whatever the outcome, the remembered destination is spent — it must not leak to the next account. */
function forgettingReturnPath(response: NextResponse): NextResponse {
  response.cookies.delete(RETURN_PATH_COOKIE);
  return response;
}

function signInWithError(request: NextRequest, reason: string): string {
  return absoluteUrl(request, `/sign-in?error=${encodeURIComponent(reason)}`);
}

/**
 * Builds an absolute URL for a redirect. `request.url` carries the internal
 * origin once the app is behind Vercel's proxy, so the forwarded host wins
 * where there is one.
 */
function absoluteUrl(request: NextRequest, path: string): string {
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedHost && process.env.NODE_ENV === "production") {
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${forwardedProto}://${forwardedHost}${path}`;
  }
  return new URL(path, request.nextUrl.origin).toString();
}

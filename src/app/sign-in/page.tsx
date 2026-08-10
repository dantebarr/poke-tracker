import { GoogleSignInButton } from "@/app/sign-in/google-sign-in-button";

/**
 * The only route a signed-out visitor can reach (#30, restyled to the Safari
 * Zone chrome so there's no visible seam before a Ranger is let in). It says
 * as little as possible about why a rejected account was rejected — an
 * allow-list that confirms which addresses are on it is not much of an
 * allow-list.
 */
const SIGN_IN_ERROR_MESSAGES: Record<string, string> = {
  not_allow_listed: "That account can't sign in to this app.",
  missing_code: "That sign-in link was incomplete. Please try again.",
  unavailable: "Something went wrong signing you in. Please try again.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { error } = await searchParams;
  const code = typeof error === "string" ? error : undefined;
  const message = code
    ? (SIGN_IN_ERROR_MESSAGES[code] ?? "Sign-in didn't complete. Please try again.")
    : undefined;

  return (
    <div className="gate">
      <div className="gatecard panel">
        <span className="gateball" aria-hidden="true" />
        <h1 className="pixel">Safari Zone</h1>
        <p className="tagline">Sign in to pick up where you left off, Ranger.</p>

        {message && (
          <p role="alert" className="gatealert">
            {message}
          </p>
        )}

        <GoogleSignInButton />
      </div>
    </div>
  );
}

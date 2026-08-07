import { GoogleSignInButton } from "@/app/sign-in/google-sign-in-button";

/**
 * The only route a signed-out visitor can reach. It says as little as possible
 * about why a rejected account was rejected — an allow-list that confirms which
 * addresses are on it is not much of an allow-list.
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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Poke Tracker</h1>
        <p className="mt-1 text-sm text-muted">Sign in to pick up where you left off.</p>
      </div>

      {message && (
        <p role="alert" className="rounded-md bg-urgent/10 p-3 text-sm text-urgent">
          {message}
        </p>
      )}

      <GoogleSignInButton />
    </main>
  );
}

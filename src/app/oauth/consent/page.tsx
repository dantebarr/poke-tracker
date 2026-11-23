import { redirect } from "next/navigation";

import { approveAuthorizationAction, denyAuthorizationAction } from "@/app/actions/oauth";
import { isAllowListed } from "@/lib/auth/allow-list";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTrainer } from "@/lib/trainer/trainer";

/**
 * Where Supabase's OAuth server sends a trainer to approve an MCP client such
 * as Claude (ADR-0013); `authorization_url_path` in `supabase/config.toml`
 * points here. Deliberately plain — not the Safari Zone chrome — since it is a
 * security prompt, not part of the game.
 *
 * A signed-out visitor never gets this far: the proxy sends them to sign-in and
 * `/auth/callback` brings them back to this URL. Rendering still checks, as the
 * proxy is not the security boundary.
 */
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const { authorization_id: param } = await searchParams;
  const authorizationId = typeof param === "string" ? param : undefined;

  if (!authorizationId) {
    return <Message title="Nothing to approve">This link is missing its authorization.</Message>;
  }

  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/sign-in");

  const trainer = await findTrainer(client, user.id);
  if (!trainer || !isAllowListed(user.email)) {
    return (
      <Message title="Can't connect">
        This account can&apos;t use Poke Tracker, so it can&apos;t approve a connection.
      </Message>
    );
  }

  const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    return (
      <Message title="Can't connect">
        This authorization has expired or was already decided. Start again from the app that sent
        you here.
      </Message>
    );
  }
  // Already decided for this client: the server hands back where to go next.
  if ("redirect_url" in data) redirect(data.redirect_url);

  const scopes = data.scope.split(" ").filter(Boolean);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-xl font-semibold">Connect {data.client.name} to Poke Tracker?</h1>
      <p className="mt-3 text-sm">
        Signed in as <strong>{user.email}</strong>. If you approve, <strong>{data.client.name}</strong>{" "}
        can read and change your tasks as you.
      </p>

      <h2 className="mt-6 text-sm font-semibold">It is asking for</h2>
      {scopes.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {scopes.map((scope) => (
            <li key={scope}>{scope}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm">No specific permissions.</p>
      )}

      <div className="mt-8 flex gap-3">
        <form action={approveAuthorizationAction}>
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <button type="submit" className="rounded border px-4 py-2 text-sm font-semibold">
            Approve
          </button>
        </form>
        <form action={denyAuthorizationAction}>
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <button type="submit" className="rounded border px-4 py-2 text-sm">
            Deny
          </button>
        </form>
      </div>
    </main>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm">{children}</p>
    </main>
  );
}

"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { isAllowListed } from "@/lib/auth/allow-list";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotAllowListedError, NotSignedInError } from "@/lib/trainer/errors";
import { findTrainer } from "@/lib/trainer/trainer";

/**
 * The two decisions on the consent page (ADR-0013): a trainer lets an MCP
 * client act as them, or does not. Supabase's OAuth server holds the pending
 * authorization; these only relay the trainer's answer and send the browser on
 * to wherever the server says the client lives.
 *
 * Both take a `FormData` so they bind straight to a `<form action>`, and both
 * work out who is deciding from the session, never from the form.
 */

/**
 * Only an admitted trainer may grant a client access. The allow-list is
 * enforced at sign-in, but that alone does not stop an account which slipped
 * through earlier, or was later removed, from approving here — so this checks
 * again: a trainer record, and a still-allow-listed address.
 */
async function requireAdmittedTrainer(client: SupabaseClient): Promise<void> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new NotSignedInError();

  const trainer = await findTrainer(client, user.id);
  if (!trainer || !isAllowListed(user.email)) {
    throw new NotAllowListedError(user.email ?? null);
  }
}

function authorizationId(formData: FormData): string {
  const id = formData.get("authorization_id");
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Missing authorization_id");
  }
  return id;
}

function consentPath(formData: FormData): string {
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId(formData))}`;
}

/**
 * Approves the pending authorization.
 *
 * @throws NotSignedInError when there is no session.
 * @throws NotAllowListedError when the account is not an admitted trainer.
 * Nothing is approved in that case.
 */
export async function approveAuthorizationAction(formData: FormData): Promise<never> {
  const client = await createSupabaseServerClient();
  await requireAdmittedTrainer(client);

  const { data, error } = await client.auth.oauth.approveAuthorization(
    authorizationId(formData),
    { skipBrowserRedirect: true },
  );
  // Expired or already decided: the consent page says so, rather than an
  // error screen.
  if (error) redirect(consentPath(formData));
  redirect(data.redirect_url);
}

/**
 * Denies it. Open to any signed-in account: refusing a client grants nothing.
 *
 * @throws NotSignedInError when there is no session.
 */
export async function denyAuthorizationAction(formData: FormData): Promise<never> {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new NotSignedInError();

  const { data, error } = await client.auth.oauth.denyAuthorization(authorizationId(formData), {
    skipBrowserRedirect: true,
  });
  if (error) redirect(consentPath(formData));
  redirect(data.redirect_url);
}

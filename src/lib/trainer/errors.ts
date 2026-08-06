/**
 * The two ways an account can fail to become a trainer. Kept out of the
 * `"use server"` module, which may only export async functions.
 */

export class NotSignedInError extends Error {
  constructor() {
    super("No signed-in account");
    this.name = "NotSignedInError";
  }
}

export class NotAllowListedError extends Error {
  readonly email: string | null;

  constructor(email: string | null) {
    super("Account is not on the allow-list");
    this.name = "NotAllowListedError";
    this.email = email;
  }
}

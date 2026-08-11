import { cache } from "react";

/**
 * The instant "now" is read as, for the current request. `cache`d per
 * request the same way `currentTrainer` is: the chrome layout and the page
 * it wraps (#33) both derive today's day key from "now", and without this
 * each would take its own reading of the clock a few milliseconds apart —
 * close enough, almost always, to agree, but not guaranteed to, right at a
 * trainer's local midnight. Callers ask this instead of `new Date()`
 * wherever the same request's day key has to be the one every other part of
 * that request agrees on.
 */
export const currentMoment = cache((): Date => new Date());

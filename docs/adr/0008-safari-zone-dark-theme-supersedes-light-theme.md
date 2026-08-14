# The Safari Zone's dark theme (mockup B) supersedes the light-theme decision

**Status:** accepted

Poke Tracker was built to a light-theme specification (#14): a warm off-white surface, comfortable
in a bright room, with red and amber held in reserve for urgency and one accent hue for anything
interactive — Jarvis HUD's discipline, carried over deliberately with no dark-mode block. That
reasoning was sound for the interface it was written for: a cream-coloured card layout that gave
the game loop no visual language of its own.

Mockup B (#18) is a complete Safari Zone field station built from the HGSS menu language, and it is
a dark screen — pixel type on a dark green field, a battle-style status box, and Warden Baoba's
dialogue tray. Adopting it means giving up the light-theme guarantee entirely, not adding a
dark-mode toggle alongside it: `UI-CONSTRAINTS.md` already commits this project to two first-class
surfaces (a ~390px and a ~1440px design, neither a degraded version of the other), and that budget
doesn't stretch to a third axis of light/dark without doubling the screens every future change has
to be verified against.

The original light-theme reasoning is preserved above as **superseded**, not deleted: it was the
right call for the interface it described, and a reader who finds it in `src/app/globals.css` or
issue #14 should read this decision as the record of what changed and why, not evidence that it was
a mistake.

Considered and rejected: shipping mockup B as an opt-in dark mode alongside the existing light
theme. Doubles the token surface and the screens needing visual verification, for a fiction —
Warden Baoba, the encounter view, the Safari Zone chrome — that reads as a mismatched hybrid in
whichever theme it isn't drawn for.

**Consequence:** the `globals.css` light-theme token block is replaced by mockup B's palette, not
extended. Any future light/dark toggle is new scope, not a revival of the original spec.

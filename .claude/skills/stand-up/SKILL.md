---
name: stand-up
description: Stand up poke-tracker locally so the user can look at it themselves — "stand it up", "run the app", "start it up", "spin it up", "let me see it". Starts the database and the dev server, then hands off the URL.
---

# Stand up poke-tracker

Two commands, then hand off.

1. `npm run db:start` — local Supabase. Idempotent, so a stack already up is left alone.
2. `npm run dev` — in the background, so it survives the turn.
3. Tell the user to open **http://localhost:3000**.

Stop at the URL. The user signs in with Google in their own browser and looks at
the page themselves — that is the whole point of standing it up.

Everything past the URL costs more than it returns. There is no local sign-in
bypass: `/auth/callback` exchanges a real Google code and checks
`POKE_TRACKER_ALLOWED_EMAILS`, so reaching a signed-in screen without the user
means minting a session by hand, provisioning a trainer, and driving a headless
browser — slower than the user clicking sign-in, and it leaves an account in the
local database to clean up afterwards.

`npm run db:reset` replays the migrations into an empty database when they want a
genuine first run.

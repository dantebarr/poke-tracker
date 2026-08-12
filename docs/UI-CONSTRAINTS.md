Poke Tracker — UI constraints
Surfaces

This app has two first-class surfaces. Mobile (~390px) and desktop (~1440px) each get a purpose-built layout composed from shared, layout-agnostic components. Neither is a degraded version of the other. Mobile optimizes for one-handed thumb use; desktop optimizes for keyboard-driven speed and information density.

A component should adapt its container, not its identity — a task row is a full-width card on mobile and a dense table row on desktop.
Desktop must exploit its space: multi-column, persistent sidebar nav, task list and Pokédex visible simultaneously rather than behind a tab switch. A single narrow centered column on a large viewport is a bug.
Mobile presents multiple panels as full-screen panes reached by explicit buttons, not a stacked single column and not a swipe gesture — a visible affordance beats a gesture every time.
Hover-reveal actions are fine on desktop. Mobile must always have a non-hover path to the same action — explicit button, long-press, or swipe with a visible affordance.
Layout
Relative units (rem, %, fr), Flexbox/Grid. No fixed pixel widths.
Viewport meta includes viewport-fit=cover; respect env(safe-area-inset-bottom) on any fixed bottom bar.
Use 100dvh with a 100vh fallback. Never 100vh alone for full-screen layouts.
Touch
Touch targets ≥44px, with extra care on checkboxes and complete buttons — a mis-tap there mutates state and fires rewards.
Primary actions live in the bottom third of the mobile screen.
Animation
Animate only transform and opacity. Never width, height, top, or left.
Celebration animations are capped at ~1.5s and must be interruptible. Rapid completion (especially keyboard-driven on desktop) must never queue or block on animation.
Honour prefers-reduced-motion: rewards degrade to a static state change, never vanish entirely.
Don't depend on navigator.vibrate (unsupported in iOS Safari) or audio (iOS needs a gesture to unlock the audio context, and the silent switch mutes it). Visual feedback carries the reward; sound and haptics are bonus layers.
Sprites
Explicit width/height on every sprite to prevent layout shift.
image-rendering: pixelated for pixel art so it stays crisp on high-DPI displays.
Data
Optimistic UI on task completion is non-negotiable. Check-off renders instantly, reconciles with Supabase after, and rolls back visibly on failure. The reward animation never waits on a network round-trip.
Assume the Fly.io backend may cold-start. Skeletons, not spinners. Never block first paint on the API.
Forms
Correct input type for the mobile keyboard.
font-size: 16px minimum on inputs to prevent Safari auto-zoom.
Task capture requires a title, a due date, a label and a size — all four are NOT NULL in the schema. Capture is single-step: every field is reachable without navigating away, Save is disabled until it validates, and there are no wizards. Three of the four open on defaults (due today, the trainer's top label, Small) so the common task is a title and Save; they stay on screen and editable, and a default is never a substitute for a field the Ranger cannot reach.
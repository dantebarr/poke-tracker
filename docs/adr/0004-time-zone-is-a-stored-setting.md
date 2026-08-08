# Time zone is a stored trainer setting, not detected from the browser

**Status:** accepted

A trainer's time zone lives on their **Trainer** row (`time_zone`, IANA name, defaulted to
`America/Vancouver`), set from the Settings screen. Nothing reads `Intl.DateTimeFormat().resolvedOptions().timeZone`
or any other browser-supplied zone. Every part of the app that needs to know what day it is —
settlement, the points readout, task buckets, history — derives it from this one stored value.

Detection was the original design, and the intuitive one: settlement's client trigger read the
browser's zone and passed it straight into the settlement action on every app entry. It produced
two compounding failures. First, the trainer's very first day was seeded as already-settled at
account-creation time, using the database server's own zone (UTC) rather than the trainer's —
detection was never even in that path, since there was no request to read a browser from yet.
Second, and separately, every server-rendered date (today's points, task buckets, the "Today" /
"Yesterday" grouping of done tasks) was computed in the server's own zone, while settlement used
whatever zone the browser last sent — two different definitions of **Day** in the same app,
agreeing only for a trainer on UTC.

A stored setting fixes both for the same reason: it gives a value that exists *before* any browser
has sent a request (so the seeding trigger can use it at INSERT time) and *the same* value on every
code path that needs one (so settlement and display can't drift apart). Detection could only ever
supply the second half, on requests where a browser happens to be present — never the first.

Considered and rejected: keep detection for display, add a stored zone only for the seeding
trigger. Two sources of truth for the same concept is exactly the failure mode this fix exists to
remove — a future change to either one silently reintroduces the disagreement. **One definition of
Day, everywhere** requires one source.

A trainer who never visits Settings gets the default rather than a guess at where they actually
are. This is accepted: a wrong default is visible and correctable by the trainer in one visit to
Settings; a wrong *detected* value silently mis-settled their very first days in exactly the way
this ADR exists to prevent.

**Consequence:** moving the setting is a deliberate trainer action with an uncompensated cost —
changing zone can advance or retreat the trainer's current day and cause the day in progress to
settle on partial points. Detection would have hidden this same edge case behind "sometimes true
on flights," not removed it. A future feature that wants to *suggest* a zone at first sign-in must
still store the trainer's choice, not the raw detected value, and must not run before the trainer
row (and its default) already exists.

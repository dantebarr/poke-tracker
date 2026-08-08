#!/usr/bin/env python3
"""Generate the two B variants from b-safari-gear.html.

Everything except the content below is copied verbatim from B, so the chrome
stays byte-identical across the three and any later change to B's design only
has to be made once (re-run this).
"""
import pathlib

SRC = pathlib.Path("b-safari-gear.html")
src = SRC.read_text()


def cut(text, start, end, new):
    """Replace the span between `start` and `end`, keeping both anchors."""
    i = text.index(start) + len(start)
    j = text.index(end, i)
    return text[:i] + new + text[j:]


LABELS = {
    "RESERVE": ("RSV", "var(--rsv)", "var(--rsv-done)"),
    "RESEARCH": ("RSH", "var(--rsh)", "var(--rsh-done)"),
    "ADMIN": ("ADM", "var(--adm)", "var(--adm-done)"),
}


def row(label, title, size, due, notes):
    abbr, color, _ = LABELS[label]
    opts = lambda opts, sel: "".join(
        f'<option value="{o}"{" selected" if o == sel else ""}>{o}</option>' for o in opts)
    return f'''            <div class="taskrow" data-label="{label}" data-due="{due}">
              <div class="rowhead">
                <button class="circle" aria-label="Complete task" title="Complete"></button>
                <span class="tag" style="background:{color}">{abbr}</span>
                <input class="title" type="text" value="{title}" readonly>
                <span class="sz">{size}</span>
              </div>
              <div class="expander">
                <textarea class="notes" placeholder="Notes">{notes}</textarea>
                <div class="chips">
                  <label class="chip">DUE <input type="date" value="{due}"></label>
                  <label class="chip">LABEL
                    <select>{opts(LABELS.keys(), label)}</select>
                  </label>
                  <label class="chip">SIZE
                    <select>{opts(["S","M","L"], size)}</select>
                  </label>
                  <div class="editactions">
                    <button class="ghostbtn closebtn">CLOSE</button>
                    <button class="delbtn">DELETE</button>
                  </div>
                </div>
              </div>
            </div>
'''


def done_row(label, title, size):
    abbr, _, done_color = LABELS[label]
    return f'''              <div class="taskrow done" data-label="{label}">
                <div class="rowhead">
                  <span class="circle check" aria-hidden="true"></span>
                  <span class="tag" style="background:{done_color}">{abbr}</span>
                  <span class="title">{title}</span>
                  <span class="sz">{size}</span>
                </div>
              </div>
'''


def bucket(name, heading, rows_html, late=False):
    if not rows_html:
        return ""
    head = f'<div class="grouphead late"><b>{heading}</b></div>' if late else f'<div class="grouphead">{heading}</div>'
    return f'''          <div class="bucket" data-bucket="{name}">
            {head}
{rows_html}          </div>

'''


VARIANTS = {
    # ────────────────────────────────────────────────────────────────────
    "b2-forest.html": dict(
        title="Mockup B2 — The Forest",
        bg="johto-safari-zone-forest-hgss.png",
        sprite="ani-scyther.gif", alt="Scyther", width="240px",
        nick="SICKLE", species="SCYTHER &middot; No.123",
        face="beaming", warn="", mood_alt="Thriving",
        mood_title="Thriving — 4+ quiet days of slack in the bank",
        bond_pct="71%", bond="5", bond_req="/7",
        says=("Sickle cleared more deadfall this morning than you did, Ranger. "
              "Don't let it show you up twice in one week."),
        day="DAY 119", date="SAT 8 AUG", quota="4/5", quota_pct="80%",
        today_iso="2026, 7, 8",
        moods=[
            ("sad", "That's Sickle away, then. Back into the forest, bond and all — it'll remember you. Meet your share and something else will come by."),
            ("worried", "Sickle's restless, Ranger. One quiet day and it's away. Don't let today be the quiet one."),
            ("neutral", "Sickle's settled enough. You've a day of slack in hand and not a scrap more."),
            ("happy", "One point short of the day's share. Sickle's waiting by the north path — it knows the round better than you do."),
            ("beaming", "Sickle cleared more deadfall this morning than you did, Ranger. Don't let it show you up twice in one week."),
        ],
        default_mood=4,
        rows=(
            bucket("overdue", "OVERDUE", "", late=True)
            + bucket("today", "TODAY",
                row("RESERVE", "Thin the birch stand along the north path", "L", "2026-08-08",
                    "Clears the day's share on its own.")
                + row("RESEARCH", "Record Scyther wingbeat counts", "S", "2026-08-08",
                      "Sickle will sit still for it. Mostly."))
            + bucket("tomorrow", "TOMORROW",
                row("RESERVE", "Re-hang the canopy nest boxes", "M", "2026-08-09", ""))
            + bucket("later", "LATER",
                row("RESEARCH", "Photograph the Exeggcute cluster", "S", "2026-08-11",
                    "Six of them now, up from four.")
                + row("ADMIN", "Order replacement saw blades", "S", "2026-08-21", ""))
        ),
        logged_count=2,
        logged_rows=(
            done_row("RESERVE", "Dawn round of the forest trail", "S")
            + done_row("RESERVE", "Fell and stack the storm-dropped ash", "L")
        ),
    ),
    # ────────────────────────────────────────────────────────────────────
    "b3-marshland.html": dict(
        title="Mockup B3 — The Marshland",
        bg="johto-safari-zone-marshland-hgss.png",
        sprite="ani-chansey.gif", alt="Chansey", width="255px",
        nick="CUSTARD", species="CHANSEY &middot; No.113",
        face="worried", warn=" warn", mood_alt="Restless",
        mood_title="Restless — under a day of slack in the bank",
        bond_pct="43%", bond="3", bond_req="/7",
        says=("Custard's restless, Ranger. One quiet day and it's away — and you'll not "
              "see another Chansey this season. Three jobs are already late."),
        day="DAY 121", date="WED 5 AUG", quota="0/4", quota_pct="0%",
        today_iso="2026, 7, 5",
        moods=[
            ("sad", "That's Custard away, then. Back into the marsh, bond and all — it'll remember you. Meet your share and something else will come by."),
            ("worried", "Custard's restless, Ranger. One quiet day and it's away — and you'll not see another Chansey this season. Three jobs are already late."),
            ("neutral", "Custard's settled enough. You've a day of slack in hand and not a scrap more."),
            ("happy", "Better, Ranger. Custard's stopped watching the gate. Keep it that way."),
            ("beaming", "Custard's thriving. You've banked enough good days to weather a bad week — which is not an invitation to have one."),
        ],
        default_mood=1,
        rows=(
            bucket("overdue", "OVERDUE",
                row("RESERVE", "Clear the silt from the east sluice", "L", "2026-08-01",
                    "The whole east marsh is backing up behind it.")
                + row("RESEARCH", "Log the Chansey nest site", "S", "2026-08-04",
                      "Custard led you there. The least you can do is write it down."),
                late=True)
            + bucket("today", "TODAY",
                row("RESEARCH", "Test the marsh water for run-off", "M", "2026-08-05",
                    "Half the day's share in one job.")
                + row("ADMIN", "Answer the warden's second notice", "S", "2026-08-05",
                      "He has asked twice. There will not be a third."))
            + bucket("tomorrow", "TOMORROW",
                row("ADMIN", "Replace the waders in the equipment hut", "S", "2026-08-06",
                    "Both pairs leak."))
            + bucket("later", "LATER",
                row("RESEARCH", "Survey the reed beds before the rains", "L", "2026-08-20", ""))
        ),
        logged_count=0,
        logged_rows="",
    ),
}

for filename, v in VARIANTS.items():
    out = src

    out = out.replace("<title>Mockup B — Safari Gear</title>", f"<title>{v['title']}</title>")
    out = out.replace('<div class="app evolve-ready" id="app">', '<div class="app" id="app">')
    out = out.replace('assets/johto-safari-zone-savannah-hgss.png', f"assets/{v['bg']}")
    out = out.replace(
        '<img src="assets/ani-nidorina.gif" alt="Nidorina" style="width:260px">',
        f'<img src="assets/{v["sprite"]}" alt="{v["alt"]}" style="width:{v["width"]}">')

    # status box (evolve box dropped entirely: neither variant is evolve-ready)
    out = cut(out, '<div class="statusbox textbox">', '<button class="paneswitch" id="toLog"',
f'''
          <div class="line1">
            <span class="nick">{v["nick"]}</span>
            <button class="mood{v["warn"]}" id="mood" title="{v["mood_title"]}">
              <img src="assets/mood-{v["face"]}.svg" alt="{v["mood_alt"]}" id="mood-face">
            </button>
          </div>
          <div class="species">{v["species"]}</div>

          <div class="rows">
            <span class="tag">BOND</span>
            <span class="track"><i style="width:{v["bond_pct"]}"></i></span>
            <span class="num">{v["bond"]}<span class="sign">{v["bond_req"]}</span></span>
          </div>
        </div>

        <!-- Anchored to the scene, not the pane, so it always sits over the
             artwork and can never overlap Baoba's dialogue tray below. -->
        ''')

    # Baoba's line (evolvesay dropped entirely: neither variant is evolve-ready)
    out = cut(out, '<img src="../../public/npc/baoba-hgss.png" alt="Warden Baoba">', '<span class="next">',
f'''
        <div class="lines normalsay">
          <div class="who">WARDEN BAOBA</div>
          <div class="said" id="baoba-says">{v["says"]}</div>
        </div>
        ''')

    out = out.replace('id="daycount">DAY 119<', f'id="daycount">{v["day"]}<')
    out = out.replace('<span style="color:var(--pale)">SAT 8 AUG</span>',
                      f'<span style="color:var(--pale)">{v["date"]}</span>')
    out = out.replace('            <span>3/5</span>\n            <span class="track"><i></i></span>',
                      f'            <span>{v["quota"]}</span>\n'
                      f'            <span class="track"><i style="width:{v["quota_pct"]}"></i></span>')

    # the task list
    out = cut(out, '<div class="scroll" id="rows">', '<button class="paneswitch" id="toField"',
f'''

{v["rows"]}          <div class="bucket" data-bucket="done">
            <button class="grouphead loggedhead" id="loggedHead">
              <span>LOGGED TODAY</span>
              <span class="count" id="loggedCount">{v["logged_count"]}</span>
              <span class="chev" id="loggedChev">▾</span>
            </button>
            <div class="loggedrows" id="loggedRows">
{v["logged_rows"]}            </div>
          </div>
        </div>
      </div>

      ''')

    # the day this mockup is pinned to, for bucket math (overdue/today/tomorrow/later)
    out = out.replace('const TODAY = new Date(2026, 7, 8);', f'const TODAY = new Date({v["today_iso"]});')

    # Baoba's per-tier lines, and which tier this page opens on
    slacks = ['< 0 days', '0–1 days', '1–2 days', '2–4 days', '4+ days']
    labels = ['Gone', 'Restless', 'Settled', 'Content', 'Thriving']
    moods = "\n".join(
        f"    {{ face: '{f}', slack: '{s}', label: '{l}',\n      say: \"{say}\" }},"
        for (f, say), s, l in zip(v["moods"], slacks, labels))
    out = cut(out, "  const MOODS = [\n", "\n  ];", moods.rstrip(","))
    out = out.replace("  let mi = 3;", f"  let mi = {v['default_mood']};")

    pathlib.Path(filename).write_text(out)
    print(f"wrote {filename}  ({len(out)} bytes)")

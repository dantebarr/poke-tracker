#!/usr/bin/env python3
"""Generate the two B variants from b-safari-gear.html.

Everything except the content below is copied verbatim from B, so the chrome
stays byte-identical across the three and any later change to B's design only
has to be made once (re-run this).
"""
import pathlib, sys

SRC = pathlib.Path("b-safari-gear.html")
src = SRC.read_text()


def cut(text, start, end, new):
    """Replace the span between `start` and `end`, keeping both anchors."""
    i = text.index(start) + len(start)
    j = text.index(end, i)
    return text[:i] + new + text[j:]


def row(sel, tag, colour, name, size, when, late, t, d, done=False):
    cursor = ' aria-selected="true"' if sel else ""
    w = f'<span class="when{" late" if late else ""}">{when}</span>'
    return f'''          <button class="row{" done" if done else ""}"{cursor}
                  data-t="{t}"
                  data-d="{d}">
            <span class="cursor">▶</span>
            <span class="tag" style="background:{colour}">{tag}</span>
            <span class="name">{name}</span>
            <span class="sz">{size}</span>
            {w}
          </button>
'''


RSV, RSH, ADM = "#2f7d4f", "#146b62", "#8a5a3b"

VARIANTS = {
    # ────────────────────────────────────────────────────────────────────
    "b2-forest.html": dict(
        title="Mockup B2 — The Forest",
        bg="johto-safari-zone-forest-hgss.png",
        sprite="ani-scyther.gif", alt="Scyther", width="240px",
        nick="SICKLE", species="SCYTHER &middot; No.123",
        face="beaming", mood_alt="Thriving",
        mood_title="Thriving — 4+ quiet days of slack in the bank",
        warn="",
        bond_pct="71%", bond="5", bond_req="/7",
        corner=('<div class="head" style="color:#585858;animation:none">FIELD NOTES</div>\n'
                '          <p>Two more good days and SCYTHER\'s entry writes itself.</p>\n'
                '          <button>OPEN POKéDEX DRAFT</button>'),
        says=("Sickle cleared more deadfall this morning than you did, Ranger. "
              "Don't let it show you up twice in one week."),
        date="SAT 8 AUG", day="DAY 119", quota="4/5", quota_pct="80%",
        desc_t="THIN THE BIRCH STAND ALONG THE NORTH PATH",
        desc_d="RESERVE · LARGE · worth 3 pts · due today. Clears the day's share on its own.",
        moods=[
            ("sad", "That's Sickle away, then. Back into the forest, bond and all — it'll remember you. Meet your share and something else will come by."),
            ("worried", "Sickle's restless, Ranger. One quiet day and it's away. Don't let today be the quiet one."),
            ("neutral", "Sickle's settled enough. You've a day of slack in hand and not a scrap more."),
            ("happy", "One point short of the day's share. Sickle's waiting by the north path — it knows the round better than you do."),
            ("beaming", "Sickle cleared more deadfall this morning than you did, Ranger. Don't let it show you up twice in one week."),
        ],
        default_mood=4,
        rows=(
            '          <div class="grouphead">TODAY</div>\n'
            + row(True, "RSV", RSV, "Thin the birch stand along the north path", "L", "Today", False,
                  "THIN THE BIRCH STAND ALONG THE NORTH PATH",
                  "RESERVE · LARGE · worth 3 pts · due today. Clears the day's share on its own.")
            + row(False, "RSH", RSH, "Record Scyther wingbeat counts", "S", "Today", False,
                  "RECORD SCYTHER WINGBEAT COUNTS",
                  "RESEARCH · SMALL · worth 1 pt · due today. Sickle will sit still for it. Mostly.")
            + row(False, "RSH", RSH, "Bag and label the fungus samples", "M", "Today", False,
                  "BAG AND LABEL THE FUNGUS SAMPLES",
                  "RESEARCH · MEDIUM · worth 2 pts · due today. The ones from the west ridge, not the gate.")
            + '\n          <div class="grouphead">THIS WEEK</div>\n'
            + row(False, "RSV", RSV, "Re-hang the canopy nest boxes", "M", "Mon", False,
                  "RE-HANG THE CANOPY NEST BOXES",
                  "RESERVE · MEDIUM · worth 2 pts · due Monday.")
            + row(False, "RSH", RSH, "Photograph the Exeggcute cluster", "S", "Tue", False,
                  "PHOTOGRAPH THE EXEGGCUTE CLUSTER",
                  "RESEARCH · SMALL · worth 1 pt · due Tuesday. Six of them now, up from four.")
            + '\n          <div class="grouphead">LATER</div>\n'
            + row(False, "RSV", RSV, "Map the deadfall on the west ridge", "L", "19 Aug", False,
                  "MAP THE DEADFALL ON THE WEST RIDGE",
                  "RESERVE · LARGE · worth 3 pts · due 19 Aug.")
            + row(False, "ADM", ADM, "Order replacement saw blades", "S", "21 Aug", False,
                  "ORDER REPLACEMENT SAW BLADES",
                  "ADMIN · SMALL · worth 1 pt · due 21 Aug.")
            + '\n          <div class="grouphead">LOGGED TODAY</div>\n'
            + row(False, "RSV", "#4a6a52", "Dawn round of the forest trail", "S", "✓", False,
                  "DAWN ROUND OF THE FOREST TRAIL",
                  "RESERVE · SMALL · 1 pt earned with SICKLE.", done=True)
            + row(False, "RSV", "#4a6a52", "Fell and stack the storm-dropped ash", "L", "✓", False,
                  "FELL AND STACK THE STORM-DROPPED ASH",
                  "RESERVE · LARGE · 3 pts earned with SICKLE. Done is done — this one can't be undone.", done=True)
        ),
    ),
    # ────────────────────────────────────────────────────────────────────
    "b3-marshland.html": dict(
        title="Mockup B3 — The Marshland",
        bg="johto-safari-zone-marshland-hgss.png",
        sprite="ani-chansey.gif", alt="Chansey", width="255px",
        nick="CUSTARD", species="CHANSEY &middot; No.113",
        face="worried", mood_alt="Restless",
        mood_title="Restless — under a day of slack in the bank",
        warn=" warn",
        bond_pct="43%", bond="3", bond_req="/7",
        corner=('<div class="head">! RESTLESS</div>\n'
                '          <p>CUSTARD is one quiet day from wandering off.</p>\n'
                '          <button>SEE WHAT\'S OWED</button>'),
        says=("Custard's restless, Ranger. One quiet day and it's away — and you'll not "
              "see another Chansey this season. Three jobs are already late."),
        date="MON 10 AUG", day="DAY 121", quota="0/4", quota_pct="0%",
        desc_t="CLEAR THE SILT FROM THE EAST SLUICE",
        desc_d="RESERVE · LARGE · worth 3 pts · due 4 days ago. The whole east marsh is backing up behind it.",
        moods=[
            ("sad", "That's Custard away, then. Back into the marsh, bond and all — it'll remember you. Meet your share and something else will come by."),
            ("worried", "Custard's restless, Ranger. One quiet day and it's away — and you'll not see another Chansey this season. Three jobs are already late."),
            ("neutral", "Custard's settled enough. You've a day of slack in hand and not a scrap more."),
            ("happy", "Better, Ranger. Custard's stopped watching the gate. Keep it that way."),
            ("beaming", "Custard's thriving. You've banked enough good days to weather a bad week — which is not an invitation to have one."),
        ],
        default_mood=1,
        rows=(
            '          <div class="grouphead late"><b>OVERDUE</b></div>\n'
            + row(True, "RSV", RSV, "Clear the silt from the east sluice", "L", "4d late", True,
                  "CLEAR THE SILT FROM THE EAST SLUICE",
                  "RESERVE · LARGE · worth 3 pts · due 4 days ago. The whole east marsh is backing up behind it.")
            + row(False, "RSV", RSV, "Re-peg the boardwalk handrail", "M", "2d late", True,
                  "RE-PEG THE BOARDWALK HANDRAIL",
                  "RESERVE · MEDIUM · worth 2 pts · due 2 days ago. The far span moves when you lean on it.")
            + row(False, "RSH", RSH, "Log the Chansey nest site", "S", "1d late", True,
                  "LOG THE CHANSEY NEST SITE",
                  "RESEARCH · SMALL · worth 1 pt · due yesterday. Custard led you there. The least you can do is write it down.")
            + '\n          <div class="grouphead">TODAY</div>\n'
            + row(False, "RSH", RSH, "Test the marsh water for run-off", "M", "Today", False,
                  "TEST THE MARSH WATER FOR RUN-OFF",
                  "RESEARCH · MEDIUM · worth 2 pts · due today. Half the day's share in one job.")
            + row(False, "ADM", ADM, "Answer the warden's second notice", "S", "Today", False,
                  "ANSWER THE WARDEN'S SECOND NOTICE",
                  "ADMIN · SMALL · worth 1 pt · due today. He has asked twice. There will not be a third.")
            + '\n          <div class="grouphead">THIS WEEK</div>\n'
            + row(False, "ADM", ADM, "Replace the waders in the equipment hut", "S", "Thu", False,
                  "REPLACE THE WADERS IN THE EQUIPMENT HUT",
                  "ADMIN · SMALL · worth 1 pt · due Thursday. Both pairs leak.")
            + '\n          <div class="grouphead">LATER</div>\n'
            + row(False, "RSH", RSH, "Survey the reed beds before the rains", "L", "3 Sep", False,
                  "SURVEY THE REED BEDS BEFORE THE RAINS",
                  "RESEARCH · LARGE · worth 3 pts · due 3 Sep.")
        ),
    ),
}

for filename, v in VARIANTS.items():
    out = src

    out = out.replace("<title>Mockup B — Safari Gear</title>", f"<title>{v['title']}</title>")
    out = out.replace('assets/johto-safari-zone-savannah-hgss.png', f"assets/{v['bg']}")
    out = out.replace(
        '<img src="assets/ani-nidorina.gif" alt="Nidorina" style="width:260px">',
        f'<img src="assets/{v["sprite"]}" alt="{v["alt"]}" style="width:{v["width"]}">')

    # status box + the corner box beside it
    out = cut(out, '        <div class="statusbox textbox">\n', '\n      </div>\n\n      <div class="dialogue textbox">',
f'''          <div class="line1">
            <span class="nick">{v["nick"]}</span>
            <button class="mood{v["warn"]}" id="mood" title="{v["mood_title"]}">
              <img src="assets/mood-{v["face"]}.svg" alt="{v["mood_alt"]}" id="mood-face">
            </button>
          </div>
          <div class="species">{v["species"]}</div>

          <div class="rows">
            <!-- Bond climbs toward a known threshold, so it's the thing that can
                 honestly be a bar. Past the requirement the bar stays full and the
                 number keeps counting (bond never stops rising). -->
            <span class="tag">BOND</span>
            <span class="track"><i style="width:{v["bond_pct"]}"></i></span>
            <span class="num">{v["bond"]}<span class="sign">{v["bond_req"]}</span></span>
          </div>
        </div>

        <div class="evolve textbox">
          {v["corner"]}
        </div>''')

    # Baoba's line
    out = cut(out, '<div class="said" id="baoba-says">', '</div>', v["says"])

    out = out.replace('<span style="color:var(--pale)">DAY 118</span>',
                      f'<span style="color:var(--pale)">{v["day"]}</span>')

    # log header
    out = out.replace('<span style="color:var(--pale)">FRI 7 AUG</span>',
                      f'<span style="color:var(--pale)">{v["date"]}</span>')
    out = out.replace('            <span>3/5</span>\n            <span class="track"><i></i></span>',
                      f'            <span>{v["quota"]}</span>\n'
                      f'            <span class="track"><i style="width:{v["quota_pct"]}"></i></span>')

    # the task list
    out = cut(out, '<div class="scroll" id="rows">\n\n', '        </div>\n\n        <div class="actions">', v["rows"])

    # description box defaults
    out = cut(out, '<div class="t" id="desc-t">', '</div>', v["desc_t"])
    out = cut(out, '<div class="d" id="desc-d">', '</div>', v["desc_d"])

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

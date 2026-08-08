# Mockup assets

Everything here exists only to make `docs/mockups/*.html` look real. **None of it is
wired into the app**, and none of it should be moved into `public/` without deciding
the licensing question below first.

## Sources

| File(s) | Source | Notes |
| --- | --- | --- |
| `johto-safari-zone-*.png` | [Bulbagarden Archives](https://archives.bulbagarden.net/) | Map screenshots of the Johto Safari Zone from HeartGold/SoulSilver — Baoba's own reserve. Used as scenery. |
| `hgss-safari-menu.png` | Bulbagarden Archives | The HGSS Safari Zone menu. Reference only — mockup B's green panels are rebuilt in CSS from it, not sliced out of it. |
| `ani-*.gif` | [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/gen5ani/) | Animated Gen-5 (Black/White) battle sprites. |
| `press-start-2p.woff2`, `silkscreen*.woff2`, `vt323.woff2` | Google Fonts (OFL) | Pixel type for mockup B. |
| `fraunces.woff2`, `inter.woff2` | Google Fonts (OFL) | Type for mockups A and C. |
| `mood-*.svg` | Drawn here | Happiness faces for mockup B, on a 16×16 pixel grid with `shape-rendering="crispEdges"` so they stay hard-edged at any size. Tiered by **happiness ÷ daily target** — quiet days banked: `sad` (below 0), `worried` (< 1 day), `neutral` (1–2), `happy` (2–4), `beaming` (4+). Original work — no licensing question. |

`../../public/npc/baoba-*.png` came from the same Bulbagarden search and sits in `public/`
rather than here because the intro modal would genuinely ship it:

- `baoba-hgss.png` — his HGSS overworld sprite (32×32). The one all three mockups use.
- `baoba-gen3.png` — the Gen-III overworld sprite (32×32).
- `baoba-gen1.png` — the Gen-I overworld sprite (16×16).
- `baoba-hgss-scene.png` — an HGSS screenshot he appears in, kept for reference.

## Licensing

Pokémon sprites, character art and screenshots are Nintendo/Game Freak/Creatures IP.
Bulbagarden hosts them under a fair-use claim; Showdown's sprite archive is a fan
resource. That is fine for a private, allow-listed, single-user app and for mockups
in a repo. It is **not** fine for anything public or commercial, and the fonts are the
only assets here with a licence that actually permits redistribution (OFL).

The repo already carries all 151 species sprites in `public/species/` under the same
assumption, so this changes nothing about the project's position — it just adds to it.

## Reproducing

Every file was fetched over plain HTTP; the Bulbagarden ones via the MediaWiki API:

```sh
curl "https://archives.bulbagarden.net/w/api.php?action=query&list=search&srsearch=Baoba&srnamespace=6&format=json"
curl -O https://play.pokemonshowdown.com/sprites/gen5ani/eevee.gif
```

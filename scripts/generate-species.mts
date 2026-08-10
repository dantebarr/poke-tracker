/**
 * Generates the species reference seed migration and sprite assets from a
 * single PokéAPI run. This script is the only thing in the repository that
 * talks to PokéAPI — the running app never does. Its output (the seed
 * migration under supabase/migrations/ and the PNGs under public/species/)
 * is committed; re-run it only to regenerate that output from scratch.
 *
 * Usage: node scripts/generate-species.mts
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://pokeapi.co/api/v2";
const SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const ANIMATED_SPRITE_BASE = `${SPRITE_BASE}/versions/generation-v/black-white/animated`;
const USER_AGENT = "poke-tracker-species-generator (gitlab.com/Infernite/poke-tracker)";
const ORIGINAL_GAME_VERSION_GROUP = "red-blue";

// The Safari Zone interface's six real areas (#22), matching the six habitat
// screenshots under docs/mockups/assets/. PokéAPI's `habitat` field has nine
// values that don't line up one-to-one with these six, so several collapse
// onto the same area:
//   - forest stays forest.
//   - grassland becomes savannah — PokéAPI files the open-plains grazers
//     (Tauros, Kangaskhan, Doduo, ...) under "grassland", and a real Safari
//     Zone's Savanna area is exactly that roster.
//   - sea and waters-edge both become marshland, the only wet area of the six.
//   - cave, mountain and rough-terrain all become peak — the reserve doesn't
//     distinguish "underground" from "rocky outcrop".
//   - urban becomes meadow — none of the six areas is a town, and the
//     human-adjacent species PokéAPI files there (Meowth, Persian, ...) read
//     closest to the open, cultivated meadow of the six.
// `rare` (legendaries) and species PokéAPI records no habitat for get the
// same fallback, landing them in the plainest, least distinctive area rather
// than a wrong-but-specific one.
type Zone = "forest" | "marshland" | "meadow" | "peak" | "plains" | "savannah";
const FALLBACK_ZONE: Zone = "plains";
const ZONE_BY_HABITAT: Record<string, Zone> = {
  cave: "peak",
  forest: "forest",
  grassland: "savannah",
  mountain: "peak",
  "rough-terrain": "peak",
  sea: "marshland",
  "waters-edge": "marshland",
  urban: "meadow",
};

// Evolution chains 1-78 are exactly the original 151 species; chain 79 is
// Chikorita, the first Gen 2 addition. A handful of these chains were later
// extended above a baby pre-evolution PokéAPI backfilled for Gen 2+ (Tyrogue,
// Mime Jr., Pichu, ...) — those sit above id 151 and are filtered out below,
// which is also why a couple of in-range species end up as roots despite
// belonging to the same chain (Hitmonlee and Hitmonchan both descend from
// chain 47, whose true root is Tyrogue).
const CHAIN_COUNT = 78;
const LAST_GEN1_ID = 151;

const SPRITE_DIR = path.join(REPO_ROOT, "public", "species");
const ANIMATED_SPRITE_DIR = path.join(REPO_ROOT, "public", "species", "animated");
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  "supabase",
  "migrations",
  "20260806170100_seed_species.sql",
);
// The species table (and its seed migration above) was already deployed
// before #22 — see CLAUDE.md on writes going through migrations, and
// ADR-0006 on migrations reaching the remote database on push to main. A
// migration already applied there won't re-run just because its file
// content changes, so the zone and animated sprite columns arrive through a
// second, additive migration rather than an edit to the first.
const ZONE_MIGRATION_PATH = path.join(
  REPO_ROOT,
  "supabase",
  "migrations",
  "20260809110000_species_zone_and_animated_sprite.sql",
);

type EvolutionDetail = {
  trigger: { name: string };
  min_level: number | null;
  version_group: { name: string };
};

type ChainLink = {
  species: { name: string; url: string };
  evolution_details: EvolutionDetail[];
  evolves_to: ChainLink[];
};

type EvolutionChainResponse = { chain: ChainLink };

type SpeciesNode = {
  id: number;
  name: string;
  evolvesFromId: number | null;
  /** Level of the level-up edge that produced this species, if any. */
  incomingLevel: number | null;
  bondRequirement: number;
};

type Edge = { parentId: number; childId: number; trigger: string; minLevel: number | null };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.ok) return (await response.json()) as T;
    if ((response.status === 429 || response.status === 403) && attempt < 5) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    throw new Error(`${response.status} ${response.statusText} fetching ${url}`);
  }
}

function idFromUrl(url: string): number {
  const match = /\/(\d+)\/$/.exec(url);
  if (!match) throw new Error(`Could not parse a numeric id from ${url}`);
  return Number(match[1]);
}

/** The evolution detail that governed the original Red/Blue games. */
function originalGameDetail(details: EvolutionDetail[]): EvolutionDetail {
  const original = details.find((d) => d.version_group.name === ORIGINAL_GAME_VERSION_GROUP);
  if (!original) {
    throw new Error(`No ${ORIGINAL_GAME_VERSION_GROUP} evolution_details entry among: ${JSON.stringify(details)}`);
  }
  return original;
}

/**
 * Walks a chain tree, recording every species with id <= LAST_GEN1_ID and the
 * edges directly between two such species. Recursion continues through
 * out-of-range links (a later-generation baby pre-evolution) so that in-range
 * descendants further down are still reached, just without a recorded parent.
 */
function collectSpecies(
  link: ChainLink,
  parentId: number | null,
  incomingLevel: number | null,
  nodes: Map<number, SpeciesNode>,
  edges: Edge[],
) {
  const id = idFromUrl(link.species.url);
  const inRange = id <= LAST_GEN1_ID;

  if (inRange) {
    nodes.set(id, { id, name: link.species.name, evolvesFromId: parentId, incomingLevel, bondRequirement: 0 });
  }

  for (const child of link.evolves_to) {
    const childId = idFromUrl(child.species.url);
    const childInRange = childId <= LAST_GEN1_ID;

    let childIncomingLevel: number | null = null;
    if (inRange && childInRange) {
      const detail = originalGameDetail(child.evolution_details);
      childIncomingLevel = detail.trigger.name === "level-up" ? detail.min_level : null;
      edges.push({ parentId: id, childId, trigger: detail.trigger.name, minLevel: detail.min_level });
    }

    collectSpecies(child, inRange ? id : null, childIncomingLevel, nodes, edges);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The bond contribution a species' own step to its next stage adds — the
 * levels that step takes (from whatever level this species was reached at)
 * divided by four, clamped between 2 and 7. A non-level-based step (stone,
 * trade, friendship, ...) or a final form with no further evolution
 * contributes the flat default of 7.
 */
function ownStepEffort(node: SpeciesNode, outgoing: Edge[]): number {
  if (outgoing.length === 0) return 7;

  const levelUps = outgoing.filter((e) => e.trigger === "level-up" && e.minLevel != null);
  if (levelUps.length === 0) return 7;

  const levels = new Set(levelUps.map((e) => e.minLevel));
  if (levels.size > 1) {
    throw new Error(`${node.name} has branching level-up evolutions at different levels; bond requirement is ambiguous`);
  }

  const outgoingLevel = levelUps[0].minLevel as number;
  const delta = outgoingLevel - (node.incomingLevel ?? 0);
  return clamp(Math.round(delta / 4), 2, 7);
}

/** Resolves every node's cumulative bond requirement, parents before children, returning insertion order. */
function computeBondRequirements(nodes: Map<number, SpeciesNode>, edges: Edge[]): number[] {
  const outgoingByParent = new Map<number, Edge[]>();
  for (const edge of edges) {
    const list = outgoingByParent.get(edge.parentId) ?? [];
    list.push(edge);
    outgoingByParent.set(edge.parentId, list);
  }

  const insertOrder: number[] = [];
  const resolved = new Set<number>();

  function resolve(id: number): number {
    if (resolved.has(id)) return (nodes.get(id) as SpeciesNode).bondRequirement;

    const node = nodes.get(id);
    if (!node) throw new Error(`Missing species node for id ${id}`);

    const parentContribution = node.evolvesFromId == null ? 0 : resolve(node.evolvesFromId);
    node.bondRequirement = parentContribution + ownStepEffort(node, outgoingByParent.get(id) ?? []);

    resolved.add(id);
    insertOrder.push(id);
    return node.bondRequirement;
  }

  for (const id of nodes.keys()) resolve(id);
  return insertOrder;
}

async function downloadSprite(id: number): Promise<void> {
  const response = await fetch(`${SPRITE_BASE}/${id}.png`, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} downloading sprite for species ${id}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(SPRITE_DIR, `${id}.png`), bytes);
}

/**
 * The Gen-V (Black/White) battle-animation sprite (#22's encounter view).
 * Distinct from `downloadSprite` above: that static PNG keeps serving
 * Pokédex tiles and Logbook rows, this animated GIF is for the encounter
 * scene only. Confirmed present for all of ids 1-151 in PokéAPI's sprite
 * repo, so unlike the zone lookup this has no fallback — a 404 here means
 * something upstream changed and the run should fail loudly.
 */
async function downloadAnimatedSprite(id: number): Promise<void> {
  const response = await fetch(`${ANIMATED_SPRITE_BASE}/${id}.gif`, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} downloading animated sprite for species ${id}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(ANIMATED_SPRITE_DIR, `${id}.gif`), bytes);
}

type SpeciesHabitatResponse = { habitat: { name: string } | null };

/** The zone a species' Safari Zone encounter is set in — see `ZONE_BY_HABITAT`. */
async function fetchZone(id: number): Promise<Zone> {
  const { habitat } = await fetchJson<SpeciesHabitatResponse>(`${API}/pokemon-species/${id}`);
  if (!habitat) return FALLBACK_ZONE;
  return ZONE_BY_HABITAT[habitat.name] ?? FALLBACK_ZONE;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildMigration(nodes: Map<number, SpeciesNode>, insertOrder: number[]): string {
  const rows = insertOrder.map((id) => {
    const node = nodes.get(id) as SpeciesNode;
    const evolvesFrom = node.evolvesFromId == null ? "null" : String(node.evolvesFromId);
    return `  (${node.id}, ${sqlString(node.name)}, ${sqlString(`/species/${node.id}.png`)}, ${evolvesFrom}, ${node.bondRequirement})`;
  });

  return `-- Generated by scripts/generate-species.mts from a single PokéAPI run.
-- Do not hand-edit — re-run the generator and commit its output instead.

insert into public.species (id, name, sprite_path, evolves_from_id, bond_requirement)
values
${rows.join(",\n")};
`;
}

/**
 * The additive migration for #22: `zone` and `animated_sprite_path` on the
 * already-deployed `species` table. Columns arrive nullable, get backfilled
 * in the same migration, then get their `not null` — the standard shape for
 * adding a required column to a populated table without a window where it's
 * enforced against rows that don't have it yet.
 */
function buildZoneMigration(nodes: Map<number, SpeciesNode>, insertOrder: number[], zones: Map<number, Zone>): string {
  const updates = insertOrder.map((id) => {
    const zone = zones.get(id) as Zone;
    return `update public.species set zone = ${sqlString(zone)}, animated_sprite_path = ${sqlString(`/species/animated/${id}.gif`)} where id = ${id};`;
  });

  return `-- Generated by scripts/generate-species.mts from a single PokéAPI run.
-- Do not hand-edit — re-run the generator and commit its output instead.
--
-- Additive: supabase/migrations/20260806170100_seed_species.sql already shipped
-- to the remote database (ADR-0006), so these columns arrive here rather than
-- by editing that file, which an already-applied migration would silently skip.

alter table public.species
  add column zone text,
  add column animated_sprite_path text;

${updates.join("\n")}

alter table public.species
  alter column zone set not null,
  alter column animated_sprite_path set not null,
  add constraint species_zone_check check (zone in ('forest', 'marshland', 'meadow', 'peak', 'plains', 'savannah'));

comment on column public.species.zone is
  'The habitat this species stands in on the Safari Zone encounter view — one of six real Safari Zone areas. Belongs to the species, not any instance: every instance of a given species is met in the same zone.';
comment on column public.species.animated_sprite_path is
  'An animated battle sprite for the encounter view only. The static sprite_path above continues to serve Pokédex tiles and Logbook rows.';
`;
}

async function main() {
  const nodes = new Map<number, SpeciesNode>();
  const edges: Edge[] = [];

  for (let chainId = 1; chainId <= CHAIN_COUNT; chainId++) {
    const { chain } = await fetchJson<EvolutionChainResponse>(`${API}/evolution-chain/${chainId}`);
    collectSpecies(chain, null, null, nodes, edges);
    await sleep(150);
  }

  if (nodes.size !== LAST_GEN1_ID) {
    throw new Error(`Expected ${LAST_GEN1_ID} species across chains 1-${CHAIN_COUNT}, found ${nodes.size}`);
  }

  const insertOrder = computeBondRequirements(nodes, edges);

  const charmander = nodes.get(4) as SpeciesNode;
  const charmeleon = nodes.get(5) as SpeciesNode;
  const charizard = nodes.get(6) as SpeciesNode;
  if (charmander.bondRequirement !== 4 || charmeleon.bondRequirement !== 9 || charizard.bondRequirement !== 16) {
    throw new Error(
      `Bond requirement sanity check failed: charmander=${charmander.bondRequirement}, ` +
        `charmeleon=${charmeleon.bondRequirement}, charizard=${charizard.bondRequirement}`,
    );
  }

  const eeveeEvolutions = [...nodes.values()].filter((n) => n.evolvesFromId === 133);
  if (eeveeEvolutions.length !== 3) {
    throw new Error(`Expected Eevee to have 3 children, found ${eeveeEvolutions.length}`);
  }

  await mkdir(SPRITE_DIR, { recursive: true });
  for (const id of nodes.keys()) {
    await downloadSprite(id);
    await sleep(50);
  }

  await writeFile(MIGRATION_PATH, buildMigration(nodes, insertOrder));
  console.log(`Wrote ${nodes.size} species to ${MIGRATION_PATH}`);
  console.log(`Wrote ${nodes.size} sprites to ${SPRITE_DIR}`);

  const zones = new Map<number, Zone>();
  await mkdir(ANIMATED_SPRITE_DIR, { recursive: true });
  for (const id of nodes.keys()) {
    zones.set(id, await fetchZone(id));
    await sleep(150);
    await downloadAnimatedSprite(id);
    await sleep(50);
  }

  await writeFile(ZONE_MIGRATION_PATH, buildZoneMigration(nodes, insertOrder, zones));
  console.log(`Wrote ${nodes.size} zones to ${ZONE_MIGRATION_PATH}`);
  console.log(`Wrote ${nodes.size} animated sprites to ${ANIMATED_SPRITE_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

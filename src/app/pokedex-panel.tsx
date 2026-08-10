import Image from "next/image";

import type { PokedexEntry } from "@/lib/pokemon/pokedex";
import { capitalise } from "@/lib/text";

/**
 * The Pokédex screen (#13, restyled to mockup B by #30): all 151, in order,
 * plus a count of how far along the whole thing is. Unlocked entries show
 * the species — name and static sprite, never the animated one mockup B
 * reserves for the encounter view (#22's brief: 151 looping sprites is a
 * real cost on a phone, and the silhouette treatment below is clean on a
 * still image and muddy on a moving one). Locked ones are reduced to a
 * silhouette and their number, so the shape of what is missing is visible
 * without giving away what it is. Read-only — there is no action here, only
 * the stored `pokedex_entry` rows `currentPokedex` already resolved.
 */
export function PokedexPanel({ entries }: { entries: PokedexEntry[] }) {
  const unlockedCount = entries.filter((entry) => entry.unlocked).length;
  const pct = entries.length === 0 ? 0 : Math.round((unlockedCount / entries.length) * 100);

  return (
    <div className="dexpanel panel">
      <div className="dextop">
        <h1>Pokédex</h1>
        <span className="seen">
          <span>
            {unlockedCount} / {entries.length} seen
          </span>
          <span className="dextrack">
            <i style={{ width: `${pct}%` }} />
          </span>
        </span>
      </div>
      <div className="dexscroll">
        <ul className="dexgrid">
          {entries.map((entry) => (
            <PokedexTile key={entry.speciesId} entry={entry} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function PokedexTile({ entry }: { entry: PokedexEntry }) {
  const number = String(entry.speciesId).padStart(3, "0");
  const speciesName = entry.unlocked ? capitalise(entry.name) : null;

  return (
    <li className={`dextile${entry.unlocked ? " seen" : ""}`}>
      <Image
        src={entry.spritePath}
        alt={speciesName ?? `Undiscovered species #${number}`}
        width={52}
        height={52}
        className={entry.unlocked ? undefined : "silhouette"}
      />
      <span className="dexnum">#{number}</span>
      <span className="dexname">{speciesName?.toUpperCase() ?? "???"}</span>
    </li>
  );
}

import Image from "next/image";

import type { PokedexEntry } from "@/lib/pokemon/pokedex";
import { capitalise } from "@/lib/text";

/**
 * The Pokédex screen (#13): all 151, in order. Unlocked entries show the
 * species — name and sprite; locked ones are reduced to a silhouette and
 * their number, so the shape of what is missing is visible without giving
 * away what it is. Read-only — there is no action here, only the stored
 * `pokedex_entry` rows `currentPokedex` already resolved.
 */
export function PokedexPanel({ entries }: { entries: PokedexEntry[] }) {
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      {entries.map((entry) => (
        <PokedexTile key={entry.speciesId} entry={entry} />
      ))}
    </ul>
  );
}

function PokedexTile({ entry }: { entry: PokedexEntry }) {
  const number = String(entry.speciesId).padStart(3, "0");
  const speciesName = entry.unlocked ? capitalise(entry.name) : null;

  return (
    <li className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface p-3 text-center">
      <Image
        src={entry.spritePath}
        alt={speciesName ?? `Undiscovered species #${number}`}
        width={64}
        height={64}
        className={entry.unlocked ? undefined : "brightness-0 opacity-30"}
      />
      <span className="font-mono text-[0.65rem] text-muted">#{number}</span>
      <span className="text-xs font-medium">{speciesName ?? "???"}</span>
    </li>
  );
}

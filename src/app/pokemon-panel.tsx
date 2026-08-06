import Image from "next/image";

import { setNickname } from "@/app/actions/pokemon";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";

/**
 * The home screen's centrepiece: the trainer's active Pokémon, or a plain
 * statement that they have none. Full layout and theming land with the home
 * layout slice — this panel just needs to show what it shows.
 */
export function PokemonPanel({ pokemon }: { pokemon: ActivePokemon | null }) {
  if (!pokemon) {
    return (
      <section className="rounded-lg border border-black/10 p-6 text-center">
        <p className="text-lg font-medium">No Pokémon right now</p>
        <p className="mt-1 text-sm text-black/60">
          Hit your daily target to bring one home.
        </p>
      </section>
    );
  }

  const speciesName = capitalise(pokemon.species.name);
  const metBondRequirement = pokemon.distanceToBondRequirement === 0;

  return (
    <section className="flex flex-col items-center gap-4 rounded-lg border border-black/10 p-6 text-center sm:flex-row sm:text-left">
      <Image
        src={pokemon.species.spritePath}
        alt={speciesName}
        width={96}
        height={96}
        className="shrink-0"
      />

      <div className="flex flex-1 flex-col gap-3">
        <div>
          <form
            action={setNickname.bind(null, pokemon.instanceId)}
            className="flex items-baseline justify-center gap-2 sm:justify-start"
          >
            <input
              type="text"
              name="nickname"
              defaultValue={pokemon.nickname ?? ""}
              placeholder={speciesName}
              aria-label="Nickname"
              className="w-40 border-b border-black/20 bg-transparent text-lg font-semibold outline-none focus:border-black/60"
            />
            <button type="submit" className="text-xs underline underline-offset-4">
              Save
            </button>
          </form>
          {pokemon.nickname && <p className="text-xs text-black/60">{speciesName}</p>}
        </div>

        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-black/60">Happiness</dt>
            <dd className="text-base font-medium">{pokemon.happiness}</dd>
          </div>
          <div>
            <dt className="text-black/60">Bond level</dt>
            <dd className="text-base font-medium">{pokemon.bondLevel}</dd>
          </div>
          <div>
            <dt className="text-black/60">To next bond</dt>
            <dd className="text-base font-medium">
              {metBondRequirement ? "Ready" : pokemon.distanceToBondRequirement}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function capitalise(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

import Image from "next/image";

import { evolvePokemon, setNickname } from "@/app/actions/pokemon";
import type { EvolutionOption } from "@/lib/pokemon/evolution";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";
import { capitalise } from "@/lib/text";

/**
 * The home screen's centrepiece: the trainer's active Pokémon, or a plain
 * statement that they have none. Full layout and theming land with the home
 * layout slice — this panel just needs to show what it shows.
 */
export function PokemonPanel({
  pokemon,
  evolutionOptions,
}: {
  pokemon: ActivePokemon | null;
  evolutionOptions: EvolutionOption[];
}) {
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

        {metBondRequirement && evolutionOptions.length > 0 && (
          <EvolveForm pokemon={pokemon} evolutionOptions={evolutionOptions} />
        )}
      </div>
    </section>
  );
}

/**
 * The evolve control: a picker when the current species branches, a single
 * choice otherwise — same form either way, so there is no special case to
 * get wrong. `expectedSpeciesId` pins the request to the species this render
 * actually saw, so a resubmission after the instance has already moved on
 * (a double-click racing itself) is refused server-side rather than
 * chaining an unintended second evolution — see `evolvePokemon`.
 */
function EvolveForm({
  pokemon,
  evolutionOptions,
}: {
  pokemon: ActivePokemon;
  evolutionOptions: EvolutionOption[];
}) {
  return (
    <form action={evolvePokemon} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="instanceId" value={pokemon.instanceId} />
      <input type="hidden" name="expectedSpeciesId" value={pokemon.species.id} />
      <select
        name="targetSpeciesId"
        aria-label="Evolve into"
        className="rounded-md border border-black/15 px-2 py-1 text-sm"
      >
        {evolutionOptions.map((option) => (
          <option key={option.speciesId} value={option.speciesId}>
            {capitalise(option.name)}
          </option>
        ))}
      </select>
      <button type="submit" className="rounded-md border border-black/15 px-3 py-1 text-xs font-medium">
        Evolve
      </button>
    </form>
  );
}

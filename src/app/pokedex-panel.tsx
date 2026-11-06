"use client";

import Image from "next/image";
import { useState } from "react";

import type { DexLineStep, PokedexEntry } from "@/lib/pokemon/pokedex";
import { parseDateOnly } from "@/lib/task/dates";
import { capitalise } from "@/lib/text";

/**
 * What the Ranger's current Pokémon is working toward: its species and the
 * forms it could still evolve into, with the bond each entry takes. Resolved
 * server-side from the active instance; null when there is no Pokémon in the
 * field.
 */
export type PokedexFocus = {
  pokemonName: string;
  /** The current species' own name, which the Ranger already knows even while its entry is locked. */
  speciesName: string;
  bondLevel: number;
  steps: DexLineStep[];
};

type Filter = "all" | "line" | "written";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

function pad(speciesId: number): string {
  return String(speciesId).padStart(3, "0");
}

/**
 * The Pokédex screen (#13, restyled to mockup B by #30), framed as field
 * research: the whole of the original 151, a "field notes" card naming the
 * entries the current Pokémon is bonding toward, filters, and a note for
 * whichever entry the Ranger opens. Unlocked entries show the species — name
 * and static sprite, never the animated one mockup B reserves for the
 * encounter view (#22's brief: 151 looping sprites is a real cost on a
 * phone). Locked ones are a silhouette and a number, so the shape of what is
 * missing is visible without giving away what it is — including the later
 * forms in the current line, which stay unnamed until written up. Read-only:
 * state here is only which tab and which entry are open.
 */
export function PokedexPanel({ entries, focus }: { entries: PokedexEntry[]; focus: PokedexFocus | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const unlockedCount = entries.filter((entry) => entry.unlocked).length;
  const pct = entries.length === 0 ? 0 : Math.round((unlockedCount / entries.length) * 100);

  const entryById = new Map(entries.map((entry) => [entry.speciesId, entry]));
  const stepById = new Map((focus?.steps ?? []).map((step) => [step.speciesId, step]));

  const visible = entries.filter((entry) => {
    if (filter === "written") return entry.unlocked;
    if (filter === "line") return stepById.has(entry.speciesId);
    return true;
  });
  const selected = selectedId === null ? null : (entryById.get(selectedId) ?? null);

  const tabs: { id: Filter; label: string; hidden?: boolean }[] = [
    { id: "all", label: "All" },
    { id: "line", label: "My line", hidden: !focus },
    { id: "written", label: "Written up" },
  ];

  return (
    <div className="dexpanel panel">
      <div className="dextop">
        <h1>Pokédex</h1>
        <span className="seen">
          <span>
            {unlockedCount} / {entries.length} written up
          </span>
          <span className="dextrack" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </span>
        </span>
      </div>

      <div className="dexscroll">
        <FieldNotes focus={focus} entryById={entryById} />

        <div className="dextabs" role="group" aria-label="Filter entries">
          {tabs
            .filter((tab) => !tab.hidden)
            .map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="dextab"
                aria-pressed={filter === tab.id}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
        </div>

        {visible.length === 0 ? (
          <p className="dexempty">
            Nothing written up yet. An entry is written up when a Pokémon that is that species reaches its bond
            requirement.
          </p>
        ) : (
          <ul className="dexgrid">
            {visible.map((entry) => (
              <PokedexTile
                key={entry.speciesId}
                entry={entry}
                step={stepById.get(entry.speciesId)}
                bondLevel={focus?.bondLevel ?? 0}
                selected={selectedId === entry.speciesId}
                onSelect={() => setSelectedId(selectedId === entry.speciesId ? null : entry.speciesId)}
              />
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <EntryNote
          entry={selected}
          step={stepById.get(selected.speciesId)}
          bondLevel={focus?.bondLevel ?? 0}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function FieldNotes({ focus, entryById }: { focus: PokedexFocus | null; entryById: Map<number, PokedexEntry> }) {
  if (!focus) {
    return (
      <section className="dexfocus" aria-label="Field notes">
        <div className="dexfocushead">Field notes</div>
        <p className="dexfocusline">
          No Pokémon in the field right now. Entries are written up as a Pokémon bonds with you, so the next one to
          arrive starts a new line of research.
        </p>
      </section>
    );
  }

  const open = focus.steps.filter((step) => entryById.get(step.speciesId)?.unlocked !== true);

  return (
    <section className="dexfocus" aria-label="Field notes">
      <div className="dexfocushead">Field notes · {capitalise(focus.pokemonName)}</div>
      {open.length === 0 ? (
        <p className="dexfocusline">Every entry in this line is written up. Nicely done, Ranger.</p>
      ) : (
        <ul className="dexfocuslist">
          {open.map((step) => (
            <li key={step.speciesId} className="dexfocusline">
              {describeStep(step, focus.speciesName, focus.bondLevel)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function describeStep(step: DexLineStep, speciesName: string, bondLevel: number): string {
  const number = `#${pad(step.speciesId)}`;
  const progress = `bond ${Math.min(bondLevel, step.requirement)} / ${step.requirement}`;
  if (step.current) {
    const name = capitalise(speciesName);
    if (bondLevel >= step.requirement) {
      return `${name}: ${progress}. Requirement met; it is written up when the day settles.`;
    }
    return `${name}: ${progress} to write up.`;
  }
  return `${number}: ${progress}, once it has evolved.`;
}

function PokedexTile({
  entry,
  step,
  bondLevel,
  selected,
  onSelect,
}: {
  entry: PokedexEntry;
  step: DexLineStep | undefined;
  bondLevel: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const number = pad(entry.speciesId);
  const speciesName = entry.unlocked ? capitalise(entry.name) : null;
  const working = step !== undefined && !entry.unlocked;

  return (
    <li>
      <button
        type="button"
        className={`dextile${entry.unlocked ? " seen" : ""}${working ? " target" : ""}${selected ? " open" : ""}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <Image
          src={entry.spritePath}
          alt={speciesName ?? `Undiscovered species #${number}`}
          width={52}
          height={52}
          className={entry.unlocked ? undefined : "silhouette"}
        />
        <span className="dexnum">#{number}</span>
        <span className="dexname">{speciesName?.toUpperCase() ?? "???"}</span>
        {working && (
          <span className="dexbond">
            bond {Math.min(bondLevel, step.requirement)}/{step.requirement}
          </span>
        )}
      </button>
    </li>
  );
}

function EntryNote({
  entry,
  step,
  bondLevel,
  onClose,
}: {
  entry: PokedexEntry;
  step: DexLineStep | undefined;
  bondLevel: number;
  onClose: () => void;
}) {
  const number = pad(entry.speciesId);

  return (
    <section className="dexnote" aria-label={`Entry number ${number}`}>
      <Image
        src={entry.spritePath}
        alt=""
        width={64}
        height={64}
        className={entry.unlocked ? "dexnoteimg" : "dexnoteimg silhouette"}
      />
      <div className="dexnotetext">
        <div className="dexnotename">
          {entry.unlocked ? capitalise(entry.name) : "Not yet observed"}
          <span className="dexnotenum">#{number}</span>
        </div>
        <div className="dexnotebody">
          {entry.unlocked
            ? `Written up on ${DATE_FORMAT.format(parseDateOnly(entry.unlockedOn))}.`
            : step
              ? `In your current line: bond ${Math.min(bondLevel, step.requirement)} / ${step.requirement} to write it up.`
              : "Keep logging. A Pokémon of this species has to reach its bond requirement before the entry is written."}
        </div>
      </div>
      <button type="button" className="ghostbtn dexnoteclose" onClick={onClose}>
        Close
      </button>
    </section>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createLabelAction,
  deleteLabelAction,
  moveLabelAction,
  recolorLabelAction,
  renameLabelAction,
} from "@/app/actions/label";
import { updateDailyTargetAction } from "@/app/actions/trainer";
import { currentLabels } from "@/lib/label/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * A trainer's labels and daily target. Every mutation here is its own plain
 * form bound to a server action — no client JavaScript is needed, so the
 * screen works even before it hydrates.
 */
export default async function SettingsPage() {
  const trainer = await currentTrainer();
  if (!trainer) {
    redirect("/sign-in");
  }

  const labels = await currentLabels(trainer.id);

  // The actions above return the changed row, useful to callers that need it
  // (the tests do). A `<form action>` must return `void`, so each is wrapped
  // here to discard that value — the page re-renders from `revalidatePath`
  // inside the action either way.
  async function submitDailyTarget(formData: FormData) {
    "use server";
    await updateDailyTargetAction(formData);
  }
  async function submitMoveLabel(formData: FormData) {
    "use server";
    await moveLabelAction(formData);
  }
  async function submitRenameLabel(formData: FormData) {
    "use server";
    await renameLabelAction(formData);
  }
  async function submitRecolorLabel(formData: FormData) {
    "use server";
    await recolorLabelAction(formData);
  }
  async function submitCreateLabel(formData: FormData) {
    "use server";
    await createLabelAction(formData);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link className="text-sm underline underline-offset-4" href="/">
          Back to home
        </Link>
      </header>

      <section className="rounded-lg border border-black/10 p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-black/60">
          Daily target
        </h2>
        <p className="mt-1 text-sm text-black/60">
          Changing this only affects future days — already-settled days keep the target they had
          at the time.
        </p>
        <form action={submitDailyTarget} className="mt-4 flex items-center gap-3">
          <input
            type="number"
            name="target"
            min={1}
            step={1}
            defaultValue={trainer.dailyTarget}
            required
            className="w-24 rounded-md border border-black/15 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium"
          >
            Update target
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-black/10 p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-black/60">Labels</h2>

        <ul className="mt-4 flex flex-col gap-3">
          {labels.map((label, index) => (
            <li
              key={label.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-black/10 p-3"
            >
              <div className="flex flex-col">
                <form action={submitMoveLabel}>
                  <input type="hidden" name="id" value={label.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button
                    type="submit"
                    disabled={index === 0}
                    aria-label={`Move ${label.name} up`}
                    className="block px-1 text-xs disabled:opacity-30"
                  >
                    ▲
                  </button>
                </form>
                <form action={submitMoveLabel}>
                  <input type="hidden" name="id" value={label.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={index === labels.length - 1}
                    aria-label={`Move ${label.name} down`}
                    className="block px-1 text-xs disabled:opacity-30"
                  >
                    ▼
                  </button>
                </form>
              </div>

              <span
                aria-hidden
                className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: label.color }}
              />

              <form action={submitRenameLabel} className="flex items-center gap-2">
                <input type="hidden" name="id" value={label.id} />
                <input
                  type="text"
                  name="name"
                  defaultValue={label.name}
                  required
                  className="w-32 rounded-md border border-black/15 px-2 py-1 text-sm"
                />
                <button type="submit" className="text-xs underline underline-offset-4">
                  Rename
                </button>
              </form>

              <form action={submitRecolorLabel} className="flex items-center gap-2">
                <input type="hidden" name="id" value={label.id} />
                <input
                  type="color"
                  name="color"
                  defaultValue={label.color}
                  aria-label={`${label.name} colour`}
                  className="h-8 w-8 rounded border border-black/15"
                />
                <button type="submit" className="text-xs underline underline-offset-4">
                  Recolour
                </button>
              </form>

              <form action={deleteLabelAction} className="ml-auto">
                <input type="hidden" name="id" value={label.id} />
                <button type="submit" className="text-xs text-red-700 underline underline-offset-4">
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>

        <form action={submitCreateLabel} className="mt-6 flex flex-wrap items-center gap-3">
          <input
            type="text"
            name="name"
            placeholder="New label"
            required
            className="w-40 rounded-md border border-black/15 px-3 py-2 text-sm"
          />
          <input
            type="color"
            name="color"
            defaultValue="#3B82F6"
            aria-label="New label colour"
            className="h-9 w-9 rounded border border-black/15"
          />
          <button
            type="submit"
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium"
          >
            Add label
          </button>
        </form>
      </section>
    </main>
  );
}

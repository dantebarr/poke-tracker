"use client";

import { useActionState, useState } from "react";

import { deleteLabelAction, moveLabelAction, updateLabelAction } from "@/app/actions/label";

type LabelRowProps = {
  id: string;
  name: string;
  color: string;
  abbreviation: string;
  isFirst: boolean;
  isLast: boolean;
};

/**
 * One label, one form, one Save. Colour, name and abbreviation are edited in
 * place and committed together by `updateLabelAction`; Save stays disabled
 * until something differs from what is stored. Reorder and Delete are separate
 * forms beside it because they are different gestures — Delete asks first, and
 * says so when the database refuses it (a task or recurrence still uses the
 * label — the foreign key is the guard, see `deleteLabel`).
 *
 * The parent keys this on the stored values, so a successful save remounts it
 * clean rather than needing a manual reset.
 */
export function LabelRow({ id, name, color, abbreviation, isFirst, isLast }: LabelRowProps) {
  const [draft, setDraft] = useState({ name, color, abbreviation });
  const [confirming, setConfirming] = useState(false);

  const dirty = draft.name !== name || draft.color !== color || draft.abbreviation !== abbreviation;
  const valid = draft.name.trim().length > 0 && draft.abbreviation.trim().length > 0;

  const [saveError, saveAction, saving] = useActionState(async (_prev: string | null, formData: FormData) => {
    try {
      await updateLabelAction(formData);
      return null;
    } catch {
      return "Could not save. Names must be unique, and tags are 1 to 4 characters.";
    }
  }, null);

  const [deleteError, deleteAction, deleting] = useActionState(async (_prev: string | null, formData: FormData) => {
    try {
      await deleteLabelAction(formData);
      return null;
    } catch {
      setConfirming(false);
      return "Still in use by a task or a recurring task. Move or finish those first.";
    }
  }, null);

  const [moveError, moveAction] = useActionState(async (_prev: string | null, formData: FormData) => {
    try {
      await moveLabelAction(formData);
      return null;
    } catch {
      return "Could not reorder.";
    }
  }, null);

  return (
    <li className="labelcard">
      <form action={saveAction} className="labeledit">
        <input type="hidden" name="id" value={id} />
        <input
          className="swatch"
          type="color"
          name="color"
          value={draft.color}
          onChange={(event) => setDraft({ ...draft, color: event.target.value })}
          aria-label={`${name} colour`}
        />
        <input
          className="title labelname"
          type="text"
          name="name"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          aria-label={`${name} name`}
          required
        />
        <input
          className="abbrinput"
          type="text"
          name="abbreviation"
          value={draft.abbreviation}
          onChange={(event) => setDraft({ ...draft, abbreviation: event.target.value })}
          maxLength={4}
          required
          aria-label={`${name} abbreviation (tag)`}
        />
        <button type="submit" className="primary labelsave" disabled={!dirty || !valid || saving}>
          {saving ? "Saving" : "Save"}
        </button>
      </form>

      <div className="labelaside">
        <div className="reorder" role="group" aria-label={`Order of ${name}`}>
          <form action={moveAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="direction" value="up" />
            <button type="submit" className="arrowbtn" disabled={isFirst} aria-label={`Move ${name} up`}>
              ▲
            </button>
          </form>
          <form action={moveAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="direction" value="down" />
            <button type="submit" className="arrowbtn" disabled={isLast} aria-label={`Move ${name} down`}>
              ▼
            </button>
          </form>
        </div>

        {confirming ? (
          <form action={deleteAction} className="delconfirm">
            <input type="hidden" name="id" value={id} />
            <span className="delask">Delete {name}?</span>
            <button type="submit" className="delbtn delyes" disabled={deleting}>
              Yes, delete
            </button>
            <button type="button" className="ghostbtn" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </form>
        ) : (
          <button type="button" className="delbtn labeldelete" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>

      {(saveError || deleteError || moveError) && (
        <p className="labelerror" role="alert">
          {saveError ?? deleteError ?? moveError}
        </p>
      )}
    </li>
  );
}

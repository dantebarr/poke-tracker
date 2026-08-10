import { redirect } from "next/navigation";

import {
  abbreviateLabelAction,
  createLabelAction,
  deleteLabelAction,
  moveLabelAction,
  recolorLabelAction,
  renameLabelAction,
} from "@/app/actions/label";
import { signOut, updateDailyTargetAction, updateTimeZoneAction } from "@/app/actions/trainer";
import { FirstDayBriefingText } from "@/app/(app)/chrome/first-day-briefing";
import { currentLabels } from "@/lib/label/session";
import { currentTrainer } from "@/lib/trainer/session";

// Static and identical for every trainer and every request — computed once
// per server process rather than on every render of this page.
const TIME_ZONES = Intl.supportedValuesOf("timeZone");

/**
 * A trainer's labels and daily target (#30, restyled to mockup B's
 * `docs/mockups/b/b-settings.html`): every mutation here is still its own
 * plain form bound to a server action — no client JavaScript is needed, so
 * the screen works even before it hydrates. Two sections mockup B never
 * drew — Time zone and Session — get the same `.setsection` treatment
 * rather than being left on the old theme (#18's rule for undrawn states).
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
  async function submitTimeZone(formData: FormData) {
    "use server";
    await updateTimeZoneAction(formData);
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
  async function submitAbbreviateLabel(formData: FormData) {
    "use server";
    await abbreviateLabelAction(formData);
  }
  async function submitCreateLabel(formData: FormData) {
    "use server";
    await createLabelAction(formData);
  }

  return (
    <div className="stage">
      <div className="setpanel panel">
        <h1 className="settop">Ranger settings</h1>
        <div className="setscroll">
          <section className="setsection">
            <div className="sethead">Daily target</div>
            <p className="sethelp">
              Changing this only affects future days — a day already logged keeps the target it was
              judged against at the time.
            </p>
            <form action={submitDailyTarget} className="targetrow">
              <input
                className="targetinput"
                type="number"
                name="target"
                min={1}
                step={1}
                defaultValue={trainer.dailyTarget}
                required
              />
              <span className="targetunit">pts / day</span>
              <button type="submit" className="primary">
                Update target
              </button>
            </form>
          </section>

          <section className="setsection">
            <div className="sethead">Time zone</div>
            <p className="sethelp">
              What the app uses to work out your day — for settlement, today&apos;s points, and task
              buckets. Never detected from your device; set it here.
            </p>
            <form action={submitTimeZone} className="targetrow">
              <select className="tzselect" name="timeZone" defaultValue={trainer.timeZone} required aria-label="Time zone">
                {TIME_ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
              <button type="submit" className="primary">
                Update time zone
              </button>
            </form>
          </section>

          <section className="setsection">
            <div className="sethead">Labels</div>
            <p className="sethelp">
              How tasks are grouped. Yours alone — no other Ranger sees or shares this list.
            </p>

            <div className="labellist">
              {labels.map((label, index) => (
                <div key={label.id} className="labelrow">
                  <div className="reorder">
                    <form action={submitMoveLabel}>
                      <input type="hidden" name="id" value={label.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button type="submit" className="arrowbtn" disabled={index === 0} aria-label={`Move ${label.name} up`}>
                        ▲
                      </button>
                    </form>
                    <form action={submitMoveLabel}>
                      <input type="hidden" name="id" value={label.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        className="arrowbtn"
                        disabled={index === labels.length - 1}
                        aria-label={`Move ${label.name} down`}
                      >
                        ▼
                      </button>
                    </form>
                  </div>

                  <form action={submitRecolorLabel} className="fieldform">
                    <input type="hidden" name="id" value={label.id} />
                    <input
                      className="swatch"
                      type="color"
                      name="color"
                      defaultValue={label.color}
                      aria-label={`${label.name} colour`}
                    />
                    <button type="submit" className="savebtn" aria-label={`Save ${label.name} colour`}>
                      Save
                    </button>
                  </form>

                  <form action={submitRenameLabel} className="fieldform">
                    <input type="hidden" name="id" value={label.id} />
                    <input className="title" type="text" name="name" defaultValue={label.name} required />
                    <button type="submit" className="savebtn" aria-label={`Rename ${label.name}`}>
                      Rename
                    </button>
                  </form>

                  <form action={submitAbbreviateLabel} className="fieldform">
                    <input type="hidden" name="id" value={label.id} />
                    <input
                      className="abbrinput"
                      type="text"
                      name="abbreviation"
                      defaultValue={label.abbreviation}
                      maxLength={4}
                      required
                      aria-label={`${label.name} abbreviation`}
                    />
                    <button type="submit" className="savebtn" aria-label={`Save ${label.name} abbreviation`}>
                      Save
                    </button>
                  </form>

                  <form action={deleteLabelAction}>
                    <input type="hidden" name="id" value={label.id} />
                    <button type="submit" className="delbtn">
                      Delete
                    </button>
                  </form>
                </div>
              ))}
            </div>

            <details className="addeditor">
              <summary className="addbtn">+ Add a label</summary>
              <form action={submitCreateLabel} className="addeditorrow">
                <input className="swatch" type="color" name="color" defaultValue="#146B62" aria-label="New label colour" />
                <input className="title" type="text" name="name" placeholder="Label name" required />
                <input
                  className="abbrinput"
                  type="text"
                  name="abbreviation"
                  placeholder="Tag"
                  maxLength={4}
                  required
                  aria-label="New label abbreviation"
                />
                <button type="submit" className="primary">
                  Save
                </button>
              </form>
            </details>
          </section>

          <section className="setsection">
            <div className="sethead">First-day briefing</div>
            <div className="briefingbox textbox">
              <FirstDayBriefingText />
            </div>
          </section>

          <section className="setsection">
            <div className="sethead">Session</div>
            <div className="sessionrow">
              <span>{trainer.displayName ?? trainer.email}</span>
              <form action={signOut}>
                <button type="submit" className="ghostbtn">
                  Sign out
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

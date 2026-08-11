/**
 * The field screen's two-pane stage shell (#21): the grid mockup B draws on
 * desktop, and on a narrow screen one pane at a time, slid into view.
 *
 * Which pane that is arrives as a prop rather than being held here (#32).
 * The floating arrow in each pane's corner that used to switch them is gone
 * — it was a control that existed nowhere else in the app, doing a job the
 * status strip's nav row now does for every screen alike. With nothing left
 * to own, this component is no longer a client boundary at all: `left` and
 * `right` were always pre-rendered by a server component, and now the shell
 * around them is too.
 *
 * `covered` is for the one thing that replaces the whole stage rather than
 * filling a pane — a narrow screen's task detail. It is a class rather than
 * the caller simply not rendering this component, because only the mobile
 * media query knows whether the cover is real: see `FieldScreen`.
 */
export function TwoPaneStage({
  left,
  right,
  showRight,
  covered,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  showRight: boolean;
  covered: boolean;
}) {
  return (
    <div className={`stage${showRight ? " show-right" : ""}${covered ? " covered" : ""}`}>
      <div className="panes">
        <section className="pane">{left}</section>
        <section className="pane">{right}</section>
      </div>
    </div>
  );
}

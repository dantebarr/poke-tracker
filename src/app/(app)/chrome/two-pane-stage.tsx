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
 */
export function TwoPaneStage({
  left,
  right,
  showRight,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  showRight: boolean;
}) {
  return (
    <div className={`stage${showRight ? " show-right" : ""}`}>
      <div className="panes">
        <section className="pane">{left}</section>
        <section className="pane">{right}</section>
      </div>
    </div>
  );
}

/**
 * The status strip's nav icons, drawn on a 16×16 grid rather than shipped as
 * image assets — original work, ported from mockup B's inline bitmaps (same
 * drawings, rendered as `<rect>`s at request time here instead of injected
 * by a client-side script).
 */
const BITMAPS = {
  // a handheld scanner: body, a round lens, a screen line, three lights
  dex: [
    "................",
    "..111111111111..",
    "..1..........1..",
    "..1..........1..",
    "..1...111....1..",
    "..1..11111...1..",
    "..1..11111...1..",
    "..1..11111...1..",
    "..1...111....1..",
    "..1..........1..",
    "..1.11111111.1..",
    "..1..1..1..1.1..",
    "..1..........1..",
    "..111111111111..",
    "................",
    "................",
  ],
  // a closed journal: spine down the left, ruled lines for entries
  book: [
    "................",
    "................",
    "...1111111111...",
    "...1.1......1...",
    "...1.1......1...",
    "...1.1.111111...",
    "...1.1......1...",
    "...1.1.111111...",
    "...1.1......1...",
    "...1.1.111111...",
    "...1.1......1...",
    "...1.1111111...",
    "...1.1......1...",
    "...1111111111...",
    "................",
    "................",
  ],
  // a checklist: three short entries, each with a tick beside it (#32). The
  // ticks are the whole point — `book` above is already a ruled journal, and
  // at 16px a clipboard would be indistinguishable from it, which would leave
  // a Ranger's open tasks looking like their settled days.
  check: [
    "................",
    "................",
    ".....1..........",
    "..1..1..1111111.",
    "...11...........",
    "................",
    ".....1..........",
    "..1..1..1111111.",
    "...11...........",
    "................",
    ".....1..........",
    "..1..1..1111111.",
    "...11...........",
    "................",
    "................",
    "................",
  ],
  // a gear: a ring of teeth around a hollow hub
  gear: [
    "................",
    ".......1........",
    ".......1........",
    "...1.111111.1...",
    "....11....11....",
    "...11......11...",
    "...1...11...1...",
    "...1..1..1..1...",
    ".111..1..1..111.",
    "...1...11...1...",
    "...11......11...",
    "....11....11....",
    "...1.111111.1...",
    "........1.......",
    "........1.......",
    "................",
  ],
} as const satisfies Record<string, readonly string[]>;

export function PixelIcon({ name }: { name: keyof typeof BITMAPS }) {
  const bitmap = BITMAPS[name];

  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      {bitmap.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null,
        ),
      )}
    </svg>
  );
}

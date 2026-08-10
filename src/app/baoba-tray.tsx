import type { ReactNode } from "react";

import Image from "next/image";

/**
 * Warden Baoba's dialogue tray (#23): a fixed-height textbox beneath the
 * scene, carrying the one line `buildBaobaLine` chose. Renders text only —
 * the rule list and every line's copy live in `@/lib/baoba/dialogue`, so
 * adding a line never means touching this file.
 *
 * `naming` and `evolve` are the tray's fold-in slots (#24, #25): on a narrow
 * screen there's no room for a second box beside the status box, so whichever
 * prompt gets its own corner on desktop takes over this tray instead,
 * `.namingsay`/`.evolvesay` swapped in for `.normalsay` by the mobile media
 * query in globals.css. Desktop keeps showing Baoba's line regardless — the
 * swap only ever happens below the 900px breakpoint. `PokemonPane` never
 * passes both at once — the two prompts share one slot.
 */
export function BaobaTray({
  line,
  naming,
  evolve,
}: {
  line: string;
  naming?: ReactNode;
  evolve?: ReactNode;
}) {
  return (
    <div className="dialogue textbox">
      <Image src="/npc/baoba-hgss.png" alt="Warden Baoba" width={56} height={56} />
      <div className="lines normalsay">
        <div className="who">WARDEN BAOBA</div>
        <div className="said">{line}</div>
      </div>
      {naming}
      {evolve}
      <span className="next" aria-hidden="true">
        ▼
      </span>
    </div>
  );
}

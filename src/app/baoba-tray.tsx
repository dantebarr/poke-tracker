import Image from "next/image";

/**
 * Warden Baoba's dialogue tray (#23): a fixed-height textbox beneath the
 * scene, carrying the one line `buildBaobaLine` chose. Renders text only —
 * the rule list and every line's copy live in `@/lib/baoba/dialogue`, so
 * adding a line never means touching this file.
 */
export function BaobaTray({ line }: { line: string }) {
  return (
    <div className="dialogue textbox">
      <Image src="/npc/baoba-hgss.png" alt="Warden Baoba" width={56} height={56} />
      <div className="lines">
        <div className="who">WARDEN BAOBA</div>
        <div className="said">{line}</div>
      </div>
      <span className="next" aria-hidden="true">
        ▼
      </span>
    </div>
  );
}

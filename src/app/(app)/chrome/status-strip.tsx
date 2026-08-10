"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PixelIcon } from "@/app/(app)/chrome/pixel-icon";

const NAV_ITEMS = [
  { href: "/pokedex", label: "Pokédex", icon: "dex" },
  { href: "/history", label: "Logbook", icon: "book" },
  { href: "/settings", label: "Settings", icon: "gear" },
] as const;

/**
 * The chrome every authenticated screen wears (#21): who's signed in, which
 * day of their time here this is, and one click to any other screen — with
 * the screen a Ranger is already on marked, so `usePathname` is what decides
 * both that and whether the "back to the field log" link is worth showing.
 */
export function StatusStrip({ rangerName, day }: { rangerName: string; day: number }) {
  const pathname = usePathname();
  const onFieldLog = pathname === "/";

  return (
    <div className="strip">
      <span className="ball" aria-hidden="true" />
      <div className="identity">
        <span className="zone">Safari Zone</span>
        <span className="who">
          <span>Ranger {rangerName}</span>
          <span>Day {day}</span>
        </span>
      </div>
      <nav>
        {!onFieldLog && (
          <Link className="back" href="/">
            ← Field log
          </Link>
        )}
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`icobtn${active ? " active" : ""}`}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <PixelIcon name={item.icon} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

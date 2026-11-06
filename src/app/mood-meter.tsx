import { PixelIcon } from "@/app/(app)/chrome/pixel-icon";
import type { Mood } from "@/lib/baoba/dialogue";

/**
 * How the Active Pokémon feels about sticking around: five hearts and a
 * word, both read from the same bands Warden Baoba's line is chosen from
 * (`moodFor`). No number — happiness is still a background value — but when
 * it is at risk the hearts turn alert-red and the word becomes a warning, so
 * a Ranger can see a Pokémon is close to leaving before Baoba has to say so.
 */
export function MoodMeter({ mood, nickname }: { mood: Mood; nickname: string }) {
  return (
    <div
      className={`mood${mood.atRisk ? " atrisk" : ""}`}
      role="img"
      aria-label={`${nickname}'s mood: ${mood.label}${mood.atRisk ? ". At risk of leaving." : ""}`}
    >
      <span className="hearts" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= mood.level ? "on" : "off"}>
            <PixelIcon name="heart" />
          </span>
        ))}
      </span>
      <span className="moodword" aria-hidden="true">
        {mood.atRisk ? "! " : ""}
        {mood.label}
      </span>
    </div>
  );
}

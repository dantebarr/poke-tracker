import Image from "next/image";

import { markIntroSeenAction } from "@/app/actions/trainer";

/**
 * Warden Baoba's first-day briefing (#27): the only place the loop — do the
 * work and a Pokémon stays, let it down often enough and it leaves — is
 * explained before it starts costing anything. The paragraphs live here
 * rather than as a plain string array so the one bold phrase in the
 * mockup's `<dialog id="intro">` survives the port; {@link
 * FirstDayBriefingText} is exported separately so Settings can show the
 * same words without the overlay chrome around them.
 */
export function FirstDayBriefingText() {
  return (
    <>
      <p>SO YOU&rsquo;RE THE NEW RANGER. GOOD. SIT DOWN A MOMENT.</p>
      <p>
        This reserve doesn&rsquo;t run itself. Fences, water, records — a share of it has your name
        on it every day, and I&rsquo;ll expect it done.
      </p>
      <p>
        Here&rsquo;s what nobody tells you on the first day: <b>the Pokémon watch.</b> Do the work
        and one will wander over, decide you&rsquo;re worth the trouble, and stay. It&rsquo;ll help.
        It won&rsquo;t be caught, and it won&rsquo;t be told what to do.
      </p>
      <p>
        Keep at it and you&rsquo;ll know it well enough to write its entry — and it&rsquo;ll trust
        you enough to change in front of you. Let it down often enough and it wanders off. It
        remembers you either way.
      </p>
      <p>That&rsquo;s the job. Go on. ▼</p>
    </>
  );
}

/**
 * The overlay itself, rendered by the chrome layout (#21's `AppLayout`)
 * whenever `trainer.introSeenAt` is still null. A plain fixed-position panel
 * rather than a native `<dialog>`: opening a `<dialog>` as a modal needs
 * `.showModal()`, which only runs after hydration, and this has to be
 * visible — and dismissible — before that, the same reason every other write
 * in this app goes through a plain `<form>`.
 */
export function FirstDayBriefing() {
  async function dismiss() {
    "use server";
    await markIntroSeenAction();
  }

  return (
    <div className="intro-backdrop">
      <div className="intro textbox" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <div className="bar">
          <Image src="/npc/baoba-hgss.png" alt="Warden Baoba" width={48} height={48} />
          <div className="pixel" id="intro-title">
            WARDEN BAOBA
            <small>SAFARI ZONE &middot; RESERVE OFFICE</small>
          </div>
        </div>
        <div className="say">
          <FirstDayBriefingText />
        </div>
        <footer>
          <form action={dismiss}>
            <button type="submit">UNDERSTOOD</button>
          </form>
          <small>Shown once, on a Ranger&rsquo;s first day.</small>
        </footer>
      </div>
    </div>
  );
}

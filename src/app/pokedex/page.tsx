import Link from "next/link";

/** Placeholder. The 151 entries, unlocked and silhouetted, land here. */
export default function PokedexPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Pokédex</h1>
      <p className="text-black/60">Your unlocked entries will live here.</p>
      <Link className="text-sm underline underline-offset-4" href="/">
        Back to home
      </Link>
    </main>
  );
}

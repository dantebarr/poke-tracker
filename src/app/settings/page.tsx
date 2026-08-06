import Link from "next/link";

/** Placeholder. Labels and the daily target land here. */
export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-black/60">Labels and your daily target will live here.</p>
      <Link className="text-sm underline underline-offset-4" href="/">
        Back to home
      </Link>
    </main>
  );
}

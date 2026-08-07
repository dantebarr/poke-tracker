"use client";

/**
 * The app's error boundary. A rejected write — most often row-level security
 * refusing an update or delete on a task that's already done (ADR-0002) —
 * throws rather than failing silently; this is where that surfaces. `retry`
 * re-fetches and re-renders the segment, so trying again resyncs the view
 * with whatever the database actually holds, rather than a stale client
 * guess.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 p-8 text-center">
      <p className="text-lg font-medium">Something went wrong.</p>
      <p className="text-sm text-black/60">{error.message}</p>
      <button
        onClick={() => retry()}
        className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </main>
  );
}

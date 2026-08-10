"use client";

/**
 * The app's error boundary (#30, restyled to the Safari Zone chrome so a
 * failure doesn't throw a Ranger out of the world). A rejected write — most
 * often row-level security refusing an update or delete on a task that's
 * already done (ADR-0002) — throws rather than failing silently; this is
 * where that surfaces. `retry` re-fetches and re-renders the segment, so
 * trying again resyncs the view with whatever the database actually holds,
 * rather than a stale client guess.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="gate">
      <div className="gatecard panel">
        <h1 className="pixel">Something went wrong</h1>
        <p className="tagline">{error.message}</p>
        <button type="button" onClick={() => retry()} className="primary">
          Try again
        </button>
      </div>
    </div>
  );
}

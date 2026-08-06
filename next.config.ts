import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * `next dev` binds to localhost and blocks cross-origin requests for its dev
   * resources, so opening the app on 127.0.0.1 leaves the JS chunks blocked:
   * pages render but client components never hydrate, and their buttons quietly
   * do nothing.
   *
   * Both spellings are allowed because Supabase's `site_url` is 127.0.0.1 while
   * Next prints localhost, and whichever one you land on should work. This is a
   * development-only setting and has no effect on the deployed app.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;

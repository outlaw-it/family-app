/** @type {import('next').NextConfig} */
const nextConfig = {
  // App + API in one codebase. The database is Supabase Postgres, reached via the
  // postgres.js driver (pure JS — runs on Cloudflare Workers under nodejs_compat).
};

module.exports = nextConfig;

// Make Cloudflare bindings (env/secrets, e.g. DATABASE_URL) available during
// `next dev` so local dev matches the deployed Worker. No-op outside dev.
(async () => {
  try {
    const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
    await initOpenNextCloudflareForDev();
  } catch {
    // @opennextjs/cloudflare not installed yet — fine for plain `next dev`.
  }
})();

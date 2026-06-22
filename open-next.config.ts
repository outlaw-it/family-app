import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// OpenNext adapter config for Cloudflare Workers. Defaults are fine for this app:
// no ISR/edge caching needed — every route is dynamic and talks to Supabase.
export default defineCloudflareConfig();

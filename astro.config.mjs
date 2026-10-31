// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';

// SITE_BASE is set by the GitHub Pages workflow (/Sudanes-Sepsis-ALince);
// unset means root, as on Cloudflare.
// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL,
  base: process.env.SITE_BASE || '/',
  integrations: [svelte()],
});

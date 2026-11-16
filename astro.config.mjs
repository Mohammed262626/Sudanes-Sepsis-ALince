// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';

// SITE_URL sets canonical URLs at build time; unset falls back to production.
// SITE_BASE is only used by the GitHub Pages workflow; unset means root.
// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || 'https://sudansepsisalliance.com',
  base: process.env.SITE_BASE || '/',
  integrations: [
    svelte(),
    sitemap({
      filter: (page) => !/\/(admin|guest|assessment|checkin|calendar)\b/.test(page),
    }),
  ],
});

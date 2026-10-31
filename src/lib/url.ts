// Base-aware internal path: the site deploys at / on Cloudflare but under
// /<repo>/ on GitHub Pages, where absolute links would 404.
// BASE_URL has no trailing slash in Astro, so normalize it here.
const base = import.meta.env.BASE_URL.replace(/\/+$/, "");

export const url = (path = "") => `${base}/${path}`;

// Build-time fallback constants. At runtime the islands fetch the actual config
// from event_public() — these only serve as default when Supabase is unavailable.
export const EVENT = new Date("2026-11-30T09:00:00+02:00").getTime();
export const DEADLINE = new Date("2026-11-16T23:59:59+02:00").getTime();

export type EventConfig = {
  eventDate: number;
  regDeadline: number;
  eventTime: string;
  bandEnabled: boolean;
  regOpen: boolean;
  soon: boolean;
};

// True from midnight Khartoum of the event date onward — the same Khartoum
// calendar the check-in gate uses, so it holds on the day and ever after.
export function isEventDay(cfg: EventConfig): boolean {
  const day = (ms: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum" }).format(ms);
  return day(Date.now()) >= day(cfg.eventDate);
}

// Fetch the live config from the database, falling back to build-time constants.
// Several islands mount on one page (band, countdown, dates, form), so the
// promise is memoised: one request per pageview, not one per island. The result
// also survives navigation for five minutes, so a visitor costs one request per
// session rather than one per page.
const TTL_MS = 60_000;
const CACHE_KEY = "sep-event-config";

let pending: Promise<EventConfig> | null = null;

// A failed action (e.g. registration closed while the visitor's page still
// said open) wipes the cache so the next fetch sees the fresh truth.
export function invalidateEventConfig() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing cached anyway in private mode.
  }
  pending = null;
}

export function fetchEventConfig(): Promise<EventConfig> {
  return (pending ??= loadEventConfig());
}

function readCache(): EventConfig | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, cfg } = JSON.parse(raw) as { at: number; cfg: EventConfig };
    return Date.now() - at < TTL_MS ? cfg : null;
  } catch {
    return null;
  }
}

function writeCache(cfg: EventConfig) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), cfg }));
  } catch {
    // Private mode or full storage: the live fetch still worked.
  }
}

async function loadEventConfig(): Promise<EventConfig> {
  const cached = readCache();
  if (cached) return cached;
  try {
    const { supabase } = await import("../lib/supabase");
    if (!supabase) throw new Error("no supabase");
    const { data, error } = await supabase.rpc("event_public");
    if (error || !data) throw error ?? new Error("no data");
    const d = data as Record<string, unknown>;
    const cfg = {
      eventDate: d.event_date ? new Date(String(d.event_date) + "T09:00:00+02:00").getTime() : EVENT,
      regDeadline: d.reg_deadline ? new Date(String(d.reg_deadline)).getTime() : DEADLINE,
      eventTime: String(d.event_time ?? "9:00 صباحاً بتوقيت الخرطوم"),
      bandEnabled: d.band_enabled !== false,
      regOpen: d.reg_open === true,
      soon: d.soon === true,
    };
    writeCache(cfg);
    return cfg;
  } catch {
    return { eventDate: EVENT, regDeadline: DEADLINE, eventTime: "9:00 صباحاً بتوقيت الخرطوم", bandEnabled: true, regOpen: false, soon: false };
  }
}
// Build-time fallback constants. At runtime the islands fetch the actual config
// from event_public() — these only serve as default when Supabase is unavailable.
export const EVENT = new Date("2026-11-30T09:00:00+02:00").getTime();
export const DEADLINE = new Date("2026-11-16T23:59:59+02:00").getTime();

export type EventConfig = {
  eventDate: number;
  regDeadline: number;
  eventTime: string;
  bandEnabled: boolean;
  soon: boolean;
};

// Fetch the live config from the database, falling back to build-time constants.
export async function fetchEventConfig(): Promise<EventConfig> {
  try {
    const { supabase } = await import("../lib/supabase");
    if (!supabase) throw new Error("no supabase");
    const { data, error } = await supabase.rpc("event_public");
    if (error || !data) throw error ?? new Error("no data");
    const d = data as Record<string, unknown>;
    return {
      eventDate: d.event_date ? new Date(String(d.event_date) + "T09:00:00+02:00").getTime() : EVENT,
      regDeadline: d.reg_deadline ? new Date(String(d.reg_deadline)).getTime() : DEADLINE,
      eventTime: String(d.event_time ?? "9:00 صباحاً بتوقيت الخرطوم"),
      bandEnabled: d.band_enabled !== false,
      soon: d.soon === true,
    };
  } catch {
    return { eventDate: EVENT, regDeadline: DEADLINE, eventTime: "9:00 صباحاً بتوقيت الخرطوم", bandEnabled: true, soon: false };
  }
}
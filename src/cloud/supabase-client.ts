import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface NgplanSupabaseConfiguration {
  readonly url: string;
  readonly publishableKey: string;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function readSupabaseConfiguration(
  env: Readonly<Record<string, string | undefined>> = import.meta.env,
): NgplanSupabaseConfiguration | null {
  const url = nonEmpty(env.VITE_SUPABASE_URL);
  const publishableKey =
    nonEmpty(env.VITE_SUPABASE_PUBLISHABLE_KEY) ??
    nonEmpty(env.VITE_SUPABASE_ANON_KEY);
  if (url === null || publishableKey === null) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1') {
      return null;
    }
  } catch {
    return null;
  }
  return { url, publishableKey };
}

export function createNgplanSupabaseClient(
  configuration: NgplanSupabaseConfiguration,
): SupabaseClient {
  return createClient(configuration.url, configuration.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabaseConfiguration = readSupabaseConfiguration();

export const supabaseClient =
  supabaseConfiguration === null
    ? null
    : createNgplanSupabaseClient(supabaseConfiguration);

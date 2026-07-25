import { describe, expect, it } from 'vitest';
import {
  createNgplanSupabaseClient,
  readSupabaseConfiguration,
} from '../supabase-client';

describe('Supabase client configuration', () => {
  it('prefers the publishable key and supports the legacy anon-compatible variable', () => {
    expect(
      readSupabaseConfiguration({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: ' publishable ',
        VITE_SUPABASE_ANON_KEY: 'legacy',
      }),
    ).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'publishable',
    });
    expect(
      readSupabaseConfiguration({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'legacy',
      }),
    ).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'legacy',
    });
  });

  it('rejects missing, malformed, and insecure remote configuration', () => {
    expect(readSupabaseConfiguration({})).toBeNull();
    expect(
      readSupabaseConfiguration({
        VITE_SUPABASE_URL: 'not a URL',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'key',
      }),
    ).toBeNull();
    expect(
      readSupabaseConfiguration({
        VITE_SUPABASE_URL: 'http://example.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'key',
      }),
    ).toBeNull();
    expect(
      readSupabaseConfiguration({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'key',
      }),
    ).toEqual({
      url: 'http://127.0.0.1:54321',
      publishableKey: 'key',
    });
  });

  it('creates a browser client with persisted, refreshed OAuth sessions', () => {
    const client = createNgplanSupabaseClient({
      url: 'https://example.supabase.co',
      publishableKey: 'publishable',
    });

    expect(client.auth).toBeDefined();
    expect(client.from).toBeTypeOf('function');
  });
});

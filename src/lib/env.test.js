import { describe, it, expect } from 'vitest';
import { env } from './env';

describe('test environment', () => {
    it('uses placeholder Supabase settings, never the real project from .env', () => {
        expect(env.supabaseUrl).toBe('http://127.0.0.1:9');
        expect(env.supabaseAnonKey).toBe('test-anon-key');
    });
});

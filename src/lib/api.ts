import { demoBackend } from './demoBackend';
import { supabaseBackend } from './supabaseBackend';
import type { Backend } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Live when Supabase keys are set; otherwise a demo with example data. */
export const api: Backend = url && key ? supabaseBackend(url, key) : demoBackend();

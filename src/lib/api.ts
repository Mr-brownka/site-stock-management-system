import { demoBackend } from './demoBackend';
import { supabaseBackend } from './supabaseBackend';
import { isTraining, TRAINING_KEY } from './training';
import type { Backend } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** The real store (Supabase), kept even in training so the copy can be refreshed. */
export const live: Backend | null = url && key ? supabaseBackend(url, key) : null;

/** Training mode → a practice copy in this browser; live when Supabase keys are set; otherwise the demo. */
export const api: Backend = isTraining() ? demoBackend({ key: TRAINING_KEY, mode: 'training' }) : live ?? demoBackend();

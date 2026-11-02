// Opens a person's demo from their own link, with no sign-in: the link's token says who they are.
// Only for people the admin set to Demo mode. Returns their name and the item list; nothing else, and nothing is written.
import { admin, cors, json } from '../_shared/zoho.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const b = await req.json().catch(() => ({})) as { token?: string };
  const token = String(b.token ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: 'This demo link is not valid.' });
  const db = admin();
  const { data: p } = await db.from('profiles').select('full_name, status, access').eq('demo_token', token).maybeSingle();
  if (!p || p.status !== 'approved' || p.access !== 'demo') return json({ error: 'This demo link has ended. Ask for a new one.' });
  const rows: { id: number; name: string; unit: string }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await db.from('items').select('id, name, unit').order('id').range(from, from + 999);
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < 1000) break;
  }
  return json({ name: p.full_name, items: rows });
});

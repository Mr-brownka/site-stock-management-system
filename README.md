# Site Stock Management System

Live stock balances and daily consumption for a construction site store.

The storekeeper does one short **evening check-in** on their phone. Balances and consumption are worked out automatically, and the **store dashboard** shows them at any time.

## How it works

**Every evening, before the 6:00 pm register closes**, the storekeeper answers four steps. Each step starts with a Yes/No question, so nothing is skipped:

| Step | What is entered | Stock |
|---|---|---|
| 1 · Deliveries | Supplier, delivery note no., items, qty, subphase | goes up |
| 2 · Issued to production | Each Material Withdrawal Card: card no., activity, gemba, issued to, items, supervisor | goes down |
| 3 · Returned to store | Leftovers matched to today's cards: issued / back / used | goes up |
| 4 · Site transfers | Sent to or received from another site, transfer note, authorised by | down / up |

Then **Submit the day**. A submitted day is locked: entries can't be changed or deleted, only corrected.

**The two sums behind every number**

```
Balance = opening + delivered + returned + transfers in − issued − transfers out ± corrections
Used    = issued − returned
```

Nothing is typed as a balance. Every movement is saved as a row, and balances are added up from those rows, so there is always a full trail of who entered what and when.

**Store dashboard** (for the store team)

- **Consumption:** the most used item in each unit; Daily / Weekly / Monthly or any day; all items with search; group by subphase.
- **Balances:** the most ordered items; all items with search; items at or below their reorder level are marked LOW. Reorder levels are agreed with the site manager.

Other details:
- The item list holds the 1,298 project items, each with a fixed unit. A new item can be added from the item search.
- Names (suppliers, activities, people, sites) are remembered and suggested next time.
- The Enter key moves to the next box.
- Issuing or sending out more than is in store is blocked.
- Duplicate withdrawal card numbers are flagged.

## Demo mode

Without Supabase keys, the app runs as a **demo** with example data stored only in that browser. Use it to try the flow. "Reset demo" on the start page brings back fresh data.

## Setup (live data)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste all of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and click **Run**, then do the same with [`0002_lock_down_helpers.sql`](supabase/migrations/0002_lock_down_helpers.sql). This creates the tables, balance view and access rules.
3. Paste all of [`supabase/seed.sql`](supabase/seed.sql) and click **Run**. This loads the 1,298 items.
4. In **Table Editor → sites**, rename `Main site` to the real site name.
5. In **Authentication → Providers → Email**, turn **off** "Allow new users to sign up". Only people you add can sign in.
6. In **Authentication → Users → Add user**, create an account for each storekeeper (email + password, tick *Auto confirm*). Each new user is attached to the site automatically.
7. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.

> Never put the `service_role` key or the database password in the app, in GitHub or in a message.

### 2. Run it

```bash
cp .env.example .env.local   # paste the URL and anon key
npm install
npm run dev
```

### 3. Put it online (Vercel)

1. At [vercel.com](https://vercel.com), choose **Add New → Project** and import this repository.
2. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Click **Deploy**. Every push to `main` goes live automatically.

On the storekeeper's phone, open the site and choose **Add to Home Screen**. It then opens like an app.

### 4. First day

Sign in, then **Enter opening count**: count what is in the store and enter each item once. Balances start from there.

## Who can see what

Access rules in the database (row level security) make sure that:
- Only signed-in users can read anything, and only for their own site.
- Entries can be removed only by the person who made them, and only before the day is submitted.
- After submitting, only corrections can be added for that day.

## Project layout

```
supabase/migrations/0001_init.sql   tables, views, triggers, access rules
supabase/seed.sql                   the project item list
src/lib/types.ts                    shared types and the Backend interface
src/lib/supabaseBackend.ts          live data (Supabase)
src/lib/demoBackend.ts              demo data (browser only)
src/lib/store.tsx                   app state: items, balances, today's entries, step status
src/components/                     item search, remembered names, item lines, step pattern
src/screens/                        start, 4 steps, day submitted, opening count, dashboard, login
```

Built with React, TypeScript and Vite. Designs are in the "Site Stock Tracker" canvas.

## Next

- Corrections after a day is submitted (correction entries with a reason; who approves is to be agreed).
- Reminder before the register closes.
- Deformed bars (Y8, Y10, Y12…) to add to the item list.
- More sites.

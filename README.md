# MyFatnessPal

A free, ad-free tracker for food, training and sleep, built for one person. It runs in the browser,
installs to your phone's home screen, works offline at the gym, and syncs to your computer.

## What's in it so far

- Home screen with big **Meal**, **Workout** and **Sleep** buttons.
- **Food**: one running list per day with calories and protein / carbs / fat left at the top. Add food from
  recent foods, your own foods, recipes and saved meals, a search of the USDA and Open Food Facts databases,
  a barcode scan, or quick add. Targets come from your stats and goal (Mifflin-St Jeor), with the working shown,
  and can shift calories to training days.
- **Workout**: programs on fixed weekdays or a rotation, alternate exercises that rotate each session,
  warm-up sets, RIR, supersets and optional finishers. During a workout, one full-screen card per exercise
  shows every set and rest time, with a 7-segment stopwatch and a red-to-green progress bar. Weights fill in
  from last time. Includes a push / pull / legs 6x starter program.
- **Sleep**: log hours slept and how rested you feel (1 to 5) the morning after.
- **Body**: weight, body fat and tape measurements, with recent history.
- **Settings**: kg/cm or lb/in, sync sign-in, and a data export.

Everything is saved on the device first, then synced to Supabase when online.

## One-time setup

### 1. Turn on GitHub Pages
Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
After the next push to `main`, the app is live at `https://<your-github-name>.github.io/MyFatnessPal/`.

### 2. Create the database
In Supabase, open your project → **SQL Editor → New query**, paste the contents of
[`supabase/schema.sql`](supabase/schema.sql) and press **Run**.

### 3. Point Supabase at the app
Supabase → **Authentication → URL Configuration**: set **Site URL** to your GitHub Pages URL
(from step 1). This is where the account confirmation email sends you.

Optional: if you don't want to confirm by email, turn off **Authentication → Sign In / Providers → Email →
Confirm email**.

### 4. Connect the app
Supabase → **Project Settings → API**: copy the **Project URL** and the **publishable (anon) key**.
These are safe to be public; the database only lets you read and write your own rows.

Either:
- add them as repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`
  (GitHub repo **Settings → Secrets and variables → Actions → Variables**) so every device is connected automatically, or
- paste them into the app under **Settings → Sync between devices** on each device.

Then create your account in the app's Settings and sign in on your phone and computer.

### 5. Food search key (recommended)
Food search uses USDA FoodData Central. Without a key it uses a shared demo key limited to about 30 searches
an hour. Get a free key at https://api.data.gov/signup and add it as the repository variable `USDA_API_KEY`
(or paste it in the app under Settings).

### 6. Install on your phone
Open the site on your phone, then **Share → Add to Home Screen** (iPhone, Safari) or **⋮ → Install app** (Android, Chrome).

Note: Supabase pauses free projects after 7 days without use. If that happens, open the Supabase dashboard
and press **Restore**. Your data stays saved on your phone in the meantime.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run build    # production build into dist/
```

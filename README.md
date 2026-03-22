# TV Lineup Tracker v4.3.0

This build adds two big upgrades:

1. **Supabase-backed cloud sync** so the same users and shows can appear on different devices.
2. **Real user records** so you can add any users you want instead of hardwiring names into the app.

## What changed
- Added a **Users** manager.
- Added **user-based filtering** for the lineup and upcoming schedule.
- Added **show assignment** so each title can belong to one or more users.
- Added **Supabase settings** for URL, browser-safe key, and shared workspace slug.
- Added a **Sync now** button and cloud/local status pill.
- Kept **local fallback** so the app still works without Supabase.
- Softened wording around upcoming dates so the app treats them as **best-known scheduled dates**, not guaranteed U.S. platform availability.

## Files
- `index.html`
- `styles.css`
- `app.js`
- `supabase-setup.sql`

## Supabase setup
1. Create a Supabase project.
2. Open the SQL editor.
3. Run the SQL in `supabase-setup.sql`.
4. In the app, open **Settings** and paste:
   - Supabase project URL
   - Supabase publishable key or legacy anon key
   - a shared workspace slug such as `cabin-tv-household`
5. Use the **same workspace slug on every device** that should see the same tracker.

## Important security note
This version is designed for a **private personal tracker**. The included SQL uses wide-open RLS policies so any browser holding your project URL + browser key + workspace slug can read/write this tracker data. That is fine for a small personal household project, but it is **not** the final form you would want for a public app.

## TMDb
The app still uses TMDb for show search/details when you provide your TMDb API key.

## Notes about upcoming dates
The app’s upcoming list shows the **best-known scheduled next episode date** coming back from the data source. That can differ from when a service in the U.S. actually makes an episode available.


## v4.3.0 notes
- Compressed the lineup into a denser list so more shows fit on one screen.
- Compressed the top stat area into smaller single-line chips.
- Changed the default mobile pane to **Lineup** so the phone version lands on the actual shows first.
- Improved first-time Supabase connection behavior: when both local and cloud already have data, the app now merges them instead of bluntly replacing one side.

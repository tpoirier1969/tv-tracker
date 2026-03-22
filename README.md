# TV Lineup Tracker v4.1.0

# TV Lineup Tracker

This version is rebuilt to work even when TVMaze is flaky or unreachable.

## Important change
The app now uses **TMDb as the primary data source** when you paste your TMDb key into **Settings**.
That means show add/search, season details, cast, streaming platforms, and upcoming known episode dates all work from TMDb.

TVMaze is only used as a fallback if you do not provide a TMDb key.

## Where to find your TMDb key
Open your Google Sheet → **Extensions → Apps Script → Project Settings → Script Properties** → copy `TMDB_API_KEY`.

## Mobile-friendly update
On phones, the app now uses a 4-button section switcher at the top:
- Add
- Upcoming
- Lineup
- Details

That cuts down the endless vertical scrolling.


## Persistence update
The TMDb key, watch region, and cast-count settings now persist in a stable browser storage key so you should not need to re-enter them every build on the same site/browser.

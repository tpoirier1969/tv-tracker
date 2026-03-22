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

# TV Lineup Tracker

A static web app for tracking TV shows, seasons, streaming platforms, and upcoming episodes.

## What it does

- Search and add shows using TVMaze
- Resolve fuzzy or duplicate titles with a chooser
- Save your lineup in the browser with `localStorage`
- Show per-season data
- Show top-billed cast for each season when TMDb has season credits
- Show current streaming providers from TMDb watch providers
- Show upcoming episodes in a dedicated dashboard section
- Mark seasons as watched with checkboxes
- Export and import your lineup as JSON

## Files

- `index.html`
- `styles.css`
- `app.js`

## How to run locally

You can double-click `index.html`, but using a local server is better.

### Quick Python server

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## How to publish on GitHub Pages

1. Create a GitHub repo.
2. Upload the files in this folder.
3. In GitHub, go to **Settings → Pages**.
4. Set **Source** to deploy from your main branch root.
5. Wait for GitHub Pages to publish.

## TMDb API key

The app works without TMDb, but these features need the key:

- richer season descriptions
- season-specific cast when available
- streaming platform list

### Where to find the key from your existing spreadsheet project

Open your current Google Sheet, then:

1. **Extensions → Apps Script**
2. **Project Settings**
3. **Script Properties**
4. Copy the value of **`TMDB_API_KEY`**

Paste that key into the web app under **Settings**.

## Notes

- The app stores settings and lineup data in the browser, not on a server.
- If you clear browser storage, you clear the saved lineup too.
- Use **Export** occasionally so you have a backup.

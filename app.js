const STORAGE_KEY = 'tv-lineup-tracker-state-v1';

const state = {
  settings: {
    tmdbApiKey: '',
    watchRegion: 'US',
    castCount: 4,
  },
  shows: [],
  selectedId: null,
  upcomingFilter: '7',
  cache: {},
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  loadState();
  bindEvents();
  render();
}

function cacheElements() {
  els.addShowForm = document.getElementById('addShowForm');
  els.showSearch = document.getElementById('showSearch');
  els.lineupGrid = document.getElementById('lineupGrid');
  els.detailEmpty = document.getElementById('detailEmpty');
  els.detailView = document.getElementById('detailView');
  els.upcomingList = document.getElementById('upcomingList');
  els.upcomingCount = document.getElementById('upcomingCount');
  els.refreshAllBtn = document.getElementById('refreshAllBtn');
  els.chooserModal = document.getElementById('chooserModal');
  els.chooserList = document.getElementById('chooserList');
  els.settingsModal = document.getElementById('settingsModal');
  els.settingsBtn = document.getElementById('settingsBtn');
  els.settingsForm = document.getElementById('settingsForm');
  els.tmdbKeyInput = document.getElementById('tmdbKeyInput');
  els.watchRegionInput = document.getElementById('watchRegionInput');
  els.castCountInput = document.getElementById('castCountInput');
  els.exportBtn = document.getElementById('exportBtn');
  els.importFile = document.getElementById('importFile');
}

function bindEvents() {
  els.addShowForm.addEventListener('submit', onAddShowSubmit);
  els.refreshAllBtn.addEventListener('click', refreshAllShows);
  els.settingsBtn.addEventListener('click', openSettings);
  els.settingsForm.addEventListener('submit', saveSettings);
  els.exportBtn.addEventListener('click', exportState);
  els.importFile.addEventListener('change', importStateFile);

  document.querySelectorAll('[data-close-modal]').forEach((el) => el.addEventListener('click', closeChooser));
  document.querySelectorAll('[data-close-settings]').forEach((el) => el.addEventListener('click', closeSettings));
  document.querySelectorAll('[data-upcoming-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.upcomingFilter = btn.dataset.upcomingFilter;
      document.querySelectorAll('[data-upcoming-filter]').forEach((chip) => chip.classList.toggle('active', chip === btn));
      renderUpcoming();
    });
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.settings) state.settings = { ...state.settings, ...parsed.settings };
    if (Array.isArray(parsed?.shows)) state.shows = parsed.shows;
    state.selectedId = parsed?.selectedId || state.shows[0]?.tvmazeId || null;
  } catch (err) {
    console.warn('Could not load saved state', err);
  }
}

function persistState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      settings: state.settings,
      shows: state.shows,
      selectedId: state.selectedId,
    })
  );
}

function render() {
  renderLineup();
  renderSelectedDetail();
  renderUpcoming();
}

async function onAddShowSubmit(event) {
  event.preventDefault();
  const query = els.showSearch.value.trim();
  if (!query) return;

  setFormBusy(true);
  try {
    const matches = await searchShows(query);
    if (!matches.length) {
      toast(`No show match found for “${query}.”`);
      return;
    }

    const choice = chooseSearchResult(query, matches);
    if (choice.type === 'auto') {
      await addShowToLineup(choice.show);
    } else {
      openChooser(choice.candidates);
    }
  } catch (err) {
    console.error(err);
    toast('Search hit a wall. Try again in a second.');
  } finally {
    setFormBusy(false);
  }
}

function setFormBusy(isBusy) {
  const button = els.addShowForm.querySelector('button');
  button.disabled = isBusy;
  button.textContent = isBusy ? 'Searching…' : 'Add to lineup';
}

async function searchShows(query) {
  const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('TVMaze search failed');
  return response.json();
}

function normalizeTitle(value) {
  return (value || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function chooseSearchResult(raw, results) {
  const top = results[0];
  const second = results[1];
  const rawNorm = normalizeTitle(raw);
  const topNorm = normalizeTitle(top?.show?.name || '');
  const exactish = rawNorm && rawNorm === topNorm;
  const topScore = Number(top?.score || 0);
  const secondScore = Number(second?.score || 0);
  const margin = topScore - secondScore;

  if ((topScore >= 0.92 && margin >= 0.15) || (exactish && topScore >= 0.7)) {
    return { type: 'auto', show: top.show };
  }

  return {
    type: 'choose',
    candidates: results.slice(0, 6).map((result) => result.show),
  };
}

function openChooser(candidates) {
  els.chooserList.innerHTML = '';
  candidates.forEach((show) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chooser-option';
    const year = show.premiered ? show.premiered.slice(0, 4) : '????';
    const channel = show.network?.name || show.webChannel?.name || 'Unknown service';
    button.innerHTML = `<strong>${escapeHtml(show.name)}</strong><br><span>${escapeHtml(year)} — ${escapeHtml(channel)}</span>`;
    button.addEventListener('click', async () => {
      closeChooser();
      await addShowToLineup(show);
    });
    els.chooserList.appendChild(button);
  });
  els.chooserModal.classList.remove('hidden');
}

function closeChooser() {
  els.chooserModal.classList.add('hidden');
}

function openSettings() {
  els.tmdbKeyInput.value = state.settings.tmdbApiKey || '';
  els.watchRegionInput.value = state.settings.watchRegion || 'US';
  els.castCountInput.value = state.settings.castCount || 4;
  els.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  els.settingsModal.classList.add('hidden');
}

function saveSettings(event) {
  event.preventDefault();
  state.settings.tmdbApiKey = els.tmdbKeyInput.value.trim();
  state.settings.watchRegion = (els.watchRegionInput.value.trim() || 'US').toUpperCase();
  state.settings.castCount = Math.max(1, Math.min(10, Number(els.castCountInput.value || 4)));
  state.cache = {};
  persistState();
  closeSettings();
  render();
  refreshAllShows();
}

async function addShowToLineup(show) {
  if (state.shows.some((item) => item.tvmazeId === show.id)) {
    state.selectedId = show.id;
    persistState();
    render();
    toast('That show is already in your lineup.');
    return;
  }

  const entry = {
    tvmazeId: show.id,
    name: show.name,
    addedAt: new Date().toISOString(),
    watched: {},
  };

  state.shows.unshift(entry);
  state.selectedId = entry.tvmazeId;
  persistState();
  els.showSearch.value = '';

  await hydrateShow(entry.tvmazeId, { force: true });
  render();
}

async function refreshAllShows() {
  if (!state.shows.length) return;
  els.refreshAllBtn.disabled = true;
  els.refreshAllBtn.textContent = 'Refreshing…';
  try {
    for (const show of state.shows) {
      await hydrateShow(show.tvmazeId, { force: true });
    }
    render();
    toast('Lineup refreshed.');
  } catch (err) {
    console.error(err);
    toast('Refresh stumbled on one of the API calls.');
  } finally {
    els.refreshAllBtn.disabled = false;
    els.refreshAllBtn.textContent = 'Refresh all';
  }
}

async function hydrateShow(tvmazeId, { force = false } = {}) {
  const cacheKey = `${tvmazeId}|${state.settings.watchRegion}|${state.settings.castCount}`;
  if (!force && state.cache[cacheKey]) return state.cache[cacheKey];

  const [showResp, seasonsResp, episodesResp, castResp] = await Promise.all([
    fetchJson(`https://api.tvmaze.com/shows/${tvmazeId}`),
    fetchJson(`https://api.tvmaze.com/shows/${tvmazeId}/seasons`),
    fetchJson(`https://api.tvmaze.com/shows/${tvmazeId}/episodes`),
    fetchJson(`https://api.tvmaze.com/shows/${tvmazeId}/cast`),
  ]);

  let nextEpisode = null;
  if (showResp?._links?.nextepisode?.href) {
    try {
      nextEpisode = await fetchJson(showResp._links.nextepisode.href);
    } catch (err) {
      console.warn('Could not load next episode', err);
    }
  }

  const fallbackCast = (castResp || [])
    .map((item) => item?.person?.name)
    .filter(Boolean)
    .slice(0, state.settings.castCount)
    .join(', ');

  let tmdb = null;
  if (state.settings.tmdbApiKey) {
    try {
      tmdb = await getTmdbBundle(showResp);
    } catch (err) {
      console.warn('TMDb enrichment failed', err);
    }
  }

  const providerNames = tmdb?.streaming || '';
  const mainChannel = showResp.network?.name || showResp.webChannel?.name || '';
  const episodeCounts = countEpisodesBySeason(episodesResp || []);
  const seasonRows = (seasonsResp || []).slice().sort((a, b) => (a.number || 0) - (b.number || 0)).map((season, index) => {
    const seasonNum = season.number || null;
    const tmdbSeason = seasonNum != null ? tmdb?.seasonMap?.[seasonNum] : null;
    const releaseDate = season.premiereDate || tmdbSeason?.airDate || (index === 0 ? showResp.premiered || 'TBA' : 'TBA');
    const seasonDesc = tmdbSeason?.overview || (index === 0 ? stripHtml(showResp.summary || '') : '');
    const seasonCast = tmdbSeason?.cast?.length
      ? tmdbSeason.cast.join(', ')
      : fallbackCast
        ? `${fallbackCast} (series cast)`
        : '';
    const nextEpisodeText = nextEpisode && Number(nextEpisode.season) === Number(seasonNum)
      ? formatNextEpisode(nextEpisode)
      : '';

    return {
      season: seasonNum,
      episodes: episodeCounts[seasonNum] || season.episodeOrder || '',
      releaseDate,
      description: seasonDesc,
      cast: seasonCast,
      platform: providerNames,
      nextEpisode: nextEpisodeText,
    };
  });

  const bundle = {
    tvmazeId,
    show: showResp,
    seasons: seasonRows,
    nextEpisode,
    fallbackCast,
    mainChannel,
    streaming: providerNames,
    tmdbId: tmdb?.tmdbId || null,
    refreshedAt: new Date().toISOString(),
  };

  state.cache[cacheKey] = bundle;

  const showEntry = state.shows.find((item) => item.tvmazeId === tvmazeId);
  if (showEntry) {
    showEntry.name = showResp.name;
    if (tmdb?.tmdbId) showEntry.tmdbId = tmdb.tmdbId;
  }
  persistState();

  return bundle;
}

async function getTmdbBundle(tvmazeShow) {
  const apiKey = state.settings.tmdbApiKey;
  const tmdbId = await findTmdbSeriesId(tvmazeShow, apiKey);
  if (!tmdbId) return null;

  const [details, providers] = await Promise.all([
    fetchJson(tmdbUrl(`/tv/${tmdbId}`, apiKey, { language: 'en-US' })),
    fetchJson(tmdbUrl(`/tv/${tmdbId}/watch/providers`, apiKey)),
  ]);

  const seasonMap = {};
  const seasons = Array.isArray(details?.seasons) ? details.seasons : [];
  for (const season of seasons) {
    if (season?.season_number == null) continue;
    const seasonNumber = season.season_number;
    const [seasonDetails, seasonCredits] = await Promise.all([
      fetchJson(tmdbUrl(`/tv/${tmdbId}/season/${seasonNumber}`, apiKey, { language: 'en-US' })),
      fetchJson(tmdbUrl(`/tv/${tmdbId}/season/${seasonNumber}/credits`, apiKey, { language: 'en-US' })),
    ]);

    const cast = Array.isArray(seasonCredits?.cast)
      ? seasonCredits.cast
          .slice()
          .sort((a, b) => (a?.order ?? 9999) - (b?.order ?? 9999))
          .map((person) => person?.name)
          .filter(Boolean)
          .slice(0, state.settings.castCount)
      : [];

    seasonMap[seasonNumber] = {
      airDate: seasonDetails?.air_date || '',
      overview: seasonDetails?.overview?.trim() || '',
      cast,
    };
  }

  return {
    tmdbId,
    seasonMap,
    streaming: formatWatchProviders(providers, state.settings.watchRegion),
  };
}

async function findTmdbSeriesId(tvmazeShow, apiKey) {
  const query = tvmazeShow?.name || '';
  if (!query) return null;
  const results = await fetchJson(tmdbUrl('/search/tv', apiKey, { query, language: 'en-US' }));
  const list = Array.isArray(results?.results) ? results.results : [];
  if (!list.length) return null;

  const premieredYear = tvmazeShow?.premiered?.slice?.(0, 4) || '';
  let best = list[0];
  if (premieredYear) {
    const match = list.find((item) => item?.first_air_date?.slice(0, 4) === premieredYear);
    if (match) best = match;
  }
  return best?.id || null;
}

function tmdbUrl(path, apiKey, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set('api_key', apiKey);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, value);
  });
  return url.toString();
}

function formatWatchProviders(payload, region) {
  const providers = payload?.results?.[region];
  if (!providers) return '';

  const names = [
    ...(providers.flatrate || []),
    ...(providers.free || []),
    ...(providers.ads || []),
    ...(providers.rent || []),
    ...(providers.buy || []),
  ]
    .map((item) => item?.provider_name)
    .filter(Boolean);

  const unique = [...new Set(names)];
  return unique.join(', ');
}

function countEpisodesBySeason(episodes) {
  return (episodes || []).reduce((acc, episode) => {
    const season = episode?.season;
    if (season == null) return acc;
    acc[season] = (acc[season] || 0) + 1;
    return acc;
  }, {});
}

function formatNextEpisode(episode) {
  const date = episode?.airdate || (episode?.airstamp ? episode.airstamp.slice(0, 10) : 'TBA');
  return `${date} (S${episode?.season ?? '?'}E${episode?.number ?? '?'})`;
}

function renderLineup() {
  if (!state.shows.length) {
    els.lineupGrid.className = 'lineup-grid empty-state-box';
    els.lineupGrid.innerHTML = '<p>No shows saved yet. Add one above and this starts looking a lot less like a spreadsheet.</p>';
    return;
  }

  els.lineupGrid.className = 'lineup-grid';
  els.lineupGrid.innerHTML = '';

  state.shows.forEach(async (entry) => {
    const bundle = await hydrateShow(entry.tvmazeId);
    const card = document.getElementById('lineupCardTemplate').content.firstElementChild.cloneNode(true);
    const image = card.querySelector('.lineup-card__image');
    const title = card.querySelector('.lineup-card__title');
    const meta = card.querySelector('.lineup-card__meta');
    const badges = card.querySelector('.lineup-card__badges');
    const next = card.querySelector('.lineup-card__next');

    image.src = bundle.show?.image?.medium || 'https://placehold.co/300x450/11192f/eef4ff?text=TV';
    image.alt = `${bundle.show?.name || entry.name} poster`;
    title.textContent = bundle.show?.name || entry.name;

    const seasonCount = bundle.seasons.length;
    meta.textContent = `${seasonCount} season${seasonCount === 1 ? '' : 's'} saved`;

    if (bundle.mainChannel) badges.appendChild(makeBadge(bundle.mainChannel));
    if (bundle.streaming) badges.appendChild(makeBadge(bundle.streaming.split(',')[0], 'stream'));
    if (bundle.nextEpisode) badges.appendChild(makeBadge('Upcoming', 'upcoming'));

    next.textContent = bundle.nextEpisode ? `Next: ${formatNextEpisode(bundle.nextEpisode)}` : 'No known next episode date right now.';

    card.querySelector('.lineup-card__open').addEventListener('click', () => {
      state.selectedId = entry.tvmazeId;
      persistState();
      renderSelectedDetail();
    });

    card.querySelector('.lineup-card__refresh').addEventListener('click', async () => {
      await hydrateShow(entry.tvmazeId, { force: true });
      render();
      toast(`Refreshed ${bundle.show?.name || entry.name}.`);
    });

    card.querySelector('.lineup-card__delete').addEventListener('click', () => removeShow(entry.tvmazeId));

    if (state.selectedId === entry.tvmazeId) card.style.outline = '2px solid rgba(124,156,255,.55)';

    els.lineupGrid.appendChild(card);
  });
}

function makeBadge(text, variant = '') {
  const span = document.createElement('span');
  span.className = `badge ${variant}`.trim();
  span.textContent = text;
  return span;
}

function removeShow(tvmazeId) {
  state.shows = state.shows.filter((show) => show.tvmazeId !== tvmazeId);
  Object.keys(state.cache)
    .filter((key) => key.startsWith(`${tvmazeId}|`))
    .forEach((key) => delete state.cache[key]);
  if (state.selectedId === tvmazeId) state.selectedId = state.shows[0]?.tvmazeId || null;
  persistState();
  render();
}

async function renderSelectedDetail() {
  if (!state.selectedId) {
    els.detailEmpty.classList.remove('hidden');
    els.detailView.classList.add('hidden');
    els.detailView.innerHTML = '';
    return;
  }

  const bundle = await hydrateShow(state.selectedId);
  const entry = state.shows.find((item) => item.tvmazeId === state.selectedId);

  els.detailEmpty.classList.add('hidden');
  els.detailView.classList.remove('hidden');

  const poster = bundle.show?.image?.original || bundle.show?.image?.medium || 'https://placehold.co/400x600/11192f/eef4ff?text=TV';
  const status = bundle.show?.status || 'Unknown';
  const nextEpisodeText = bundle.nextEpisode ? formatNextEpisode(bundle.nextEpisode) : 'No date announced';
  const summary = stripHtml(bundle.show?.summary || 'No summary available.');
  const streaming = bundle.streaming || 'Unknown';

  els.detailView.innerHTML = `
    <section class="detail-hero">
      <div class="detail-poster"><img src="${escapeAttr(poster)}" alt="${escapeAttr(bundle.show?.name || '')} poster"></div>
      <div class="detail-summary">
        <h2>${escapeHtml(bundle.show?.name || '')}</h2>
        <p>${escapeHtml(summary)}</p>
        <div class="detail-stat-grid">
          <div class="stat-card"><span class="label">Main channel</span><span class="value">${escapeHtml(bundle.mainChannel || 'Unknown')}</span></div>
          <div class="stat-card"><span class="label">Streaming</span><span class="value">${escapeHtml(streaming)}</span></div>
          <div class="stat-card"><span class="label">Next episode</span><span class="value">${escapeHtml(nextEpisodeText)}</span></div>
          <div class="stat-card"><span class="label">Status</span><span class="value">${escapeHtml(status)}</span></div>
          <div class="stat-card"><span class="label">TVMaze ID</span><span class="value">${escapeHtml(String(bundle.tvmazeId))}</span></div>
          <div class="stat-card"><span class="label">Last refreshed</span><span class="value">${escapeHtml(formatDateTime(bundle.refreshedAt))}</span></div>
        </div>
      </div>
    </section>
    <section class="detail-table-wrap">
      <table class="detail-table">
        <thead>
          <tr>
            <th>Season</th>
            <th>Episodes</th>
            <th>Release date</th>
            <th>Description</th>
            <th>Starring</th>
            <th>Streaming</th>
            <th>Next episode</th>
            <th>Watched?</th>
          </tr>
        </thead>
        <tbody id="seasonTableBody"></tbody>
      </table>
    </section>
  `;

  const tbody = els.detailView.querySelector('#seasonTableBody');
  bundle.seasons.forEach((seasonRow) => {
    const row = document.getElementById('seasonRowTemplate').content.firstElementChild.cloneNode(true);
    row.querySelector('.season-num').textContent = seasonRow.season ?? '—';
    row.querySelector('.season-episodes').textContent = seasonRow.episodes || '—';
    row.querySelector('.season-release').textContent = seasonRow.releaseDate || 'TBA';
    row.querySelector('.season-description').textContent = seasonRow.description || '—';
    row.querySelector('.season-cast').textContent = seasonRow.cast || '—';
    row.querySelector('.season-platform').textContent = seasonRow.platform || '—';
    row.querySelector('.season-next').textContent = seasonRow.nextEpisode || '—';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(entry?.watched?.[seasonRow.season]);
    checkbox.addEventListener('change', () => {
      const showEntry = state.shows.find((item) => item.tvmazeId === bundle.tvmazeId);
      if (!showEntry) return;
      showEntry.watched = showEntry.watched || {};
      showEntry.watched[seasonRow.season] = checkbox.checked;
      persistState();
      row.classList.toggle('watched-row', checkbox.checked);
      renderLineup();
    });
    row.querySelector('.season-watched').appendChild(checkbox);

    if (checkbox.checked) row.classList.add('watched-row');
    tbody.appendChild(row);
  });
}

async function renderUpcoming() {
  const items = [];
  for (const show of state.shows) {
    const bundle = await hydrateShow(show.tvmazeId);
    if (!bundle.nextEpisode?.airdate) continue;
    items.push({
      name: bundle.show?.name || show.name,
      date: bundle.nextEpisode.airdate,
      season: bundle.nextEpisode.season,
      episode: bundle.nextEpisode.number,
      platform: bundle.streaming?.split(',')[0] || bundle.mainChannel || 'Unknown',
      tvmazeId: show.tvmazeId,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const now = startOfToday();
  const filter = state.upcomingFilter;
  const filtered = items.filter((item) => {
    if (filter === 'all') return true;
    const days = daysBetween(now, new Date(`${item.date}T00:00:00`));
    return days >= 0 && days <= Number(filter);
  });

  els.upcomingCount.textContent = `${items.length} tracked`;

  if (!filtered.length) {
    els.upcomingList.className = 'upcoming-list empty-state-box';
    els.upcomingList.innerHTML = '<p>No upcoming episodes match this filter right now.</p>';
    return;
  }

  els.upcomingList.className = 'upcoming-list';
  els.upcomingList.innerHTML = '';

  filtered.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'upcoming-item';
    const dateObj = new Date(`${item.date}T00:00:00`);
    const month = dateObj.toLocaleDateString(undefined, { month: 'short' });
    const day = dateObj.toLocaleDateString(undefined, { day: 'numeric' });
    const weekday = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
    const delta = daysBetween(startOfToday(), dateObj);

    card.innerHTML = `
      <div class="upcoming-date"><div><span>${escapeHtml(month)}</span><strong>${escapeHtml(day)}</strong><span>${escapeHtml(weekday)}</span></div></div>
      <div class="upcoming-meta">
        <h3>${escapeHtml(item.name)}</h3>
        <p>S${escapeHtml(String(item.season))}E${escapeHtml(String(item.episode))} · ${delta === 0 ? 'Drops today' : delta === 1 ? 'Drops tomorrow' : `Drops in ${delta} days`}</p>
      </div>
      <div class="upcoming-service">${escapeHtml(item.platform)}</div>
    `;

    card.addEventListener('click', () => {
      state.selectedId = item.tvmazeId;
      persistState();
      renderSelectedDetail();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    els.upcomingList.appendChild(card);
  });
}

function exportState() {
  const blob = new Blob([JSON.stringify({ settings: state.settings, shows: state.shows }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tv-lineup-export.json';
  link.click();
  URL.revokeObjectURL(url);
}

async function importStateFile(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (payload?.settings) state.settings = { ...state.settings, ...payload.settings };
    if (Array.isArray(payload?.shows)) state.shows = payload.shows;
    state.selectedId = state.shows[0]?.tvmazeId || null;
    state.cache = {};
    persistState();
    render();
    toast('Import complete.');
  } catch (err) {
    console.error(err);
    toast('That import file did not behave.');
  } finally {
    event.target.value = '';
  }
}

function fetchJson(url) {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  });
}

function stripHtml(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDateTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function toast(message) {
  // intentionally dead simple: title bar text swap would be overkill
  console.log(message);
}

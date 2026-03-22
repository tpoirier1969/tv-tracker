const STORAGE_KEY = 'tv-lineup-tracker-state-v2';
const FETCH_TIMEOUT_MS = 9000;

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
  mobilePane: 'upcoming',
};

const els = {};
let toastTimer = null;

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  loadState();
  bindEvents();
  activateMobilePane(state.mobilePane || 'upcoming');
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
  els.toast = document.getElementById('toast');
  els.mobileTabs = [...document.querySelectorAll('[data-mobile-pane-button]')];
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
  els.mobileTabs.forEach((btn) => btn.addEventListener('click', () => activateMobilePane(btn.dataset.mobilePaneButton)));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.settings) state.settings = { ...state.settings, ...parsed.settings };
    if (Array.isArray(parsed?.shows)) {
      state.shows = parsed.shows.map((show) => ({
        watched: {},
        ...show,
        id: show.id || (show.tmdbId ? `tmdb:${show.tmdbId}` : show.tvmazeId ? `tvmaze:${show.tvmazeId}` : crypto.randomUUID()),
        source: show.source || (show.tmdbId ? 'tmdb' : 'tvmaze'),
      }));
    }
    state.selectedId = parsed?.selectedId || state.shows[0]?.id || null;
    state.mobilePane = parsed?.mobilePane || 'upcoming';
  } catch (err) {
    console.warn('Could not load saved state', err);
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    settings: state.settings,
    shows: state.shows,
    selectedId: state.selectedId,
    mobilePane: state.mobilePane,
  }));
}

function activateMobilePane(name) {
  state.mobilePane = name;
  document.querySelectorAll('[data-mobile-pane]').forEach((el) => el.classList.toggle('active-pane', el.dataset.mobilePane === name));
  els.mobileTabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.mobilePaneButton === name));
  persistState();
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
      toast(`No match found for “${query}.”`);
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
    toast('Search failed. TMDb key missing or network blocked. Open Settings and paste your TMDb key.');
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
  if (state.settings.tmdbApiKey) {
    const results = await tmdbSearchShows(query);
    return results.map((item) => ({ score: scoreTmdbMatch(query, item), show: normalizeTmdbSearchResult(item) }));
  }
  const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`;
  const results = await fetchJson(url);
  return Array.isArray(results) ? results : [];
}

function normalizeTmdbSearchResult(item) {
  return {
    id: item.id,
    source: 'tmdb',
    name: item.name,
    premiered: item.first_air_date || '',
    network: { name: item.networkName || '' },
    image: item.poster_path ? { medium: `https://image.tmdb.org/t/p/w342${item.poster_path}` } : null,
    raw: item,
  };
}

function scoreTmdbMatch(raw, item) {
  const rawNorm = normalizeTitle(raw);
  const nameNorm = normalizeTitle(item.name || '');
  let score = 0.5;
  if (rawNorm === nameNorm) score += 0.4;
  else if (nameNorm.includes(rawNorm) || rawNorm.includes(nameNorm)) score += 0.2;
  if (item.popularity) score += Math.min(0.1, item.popularity / 500);
  return Math.min(0.99, score);
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

  return { type: 'choose', candidates: results.slice(0, 6).map((result) => result.show) };
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

function closeChooser() { els.chooserModal.classList.add('hidden'); }

function openSettings() {
  els.tmdbKeyInput.value = state.settings.tmdbApiKey || '';
  els.watchRegionInput.value = state.settings.watchRegion || 'US';
  els.castCountInput.value = state.settings.castCount || 4;
  els.settingsModal.classList.remove('hidden');
}

function closeSettings() { els.settingsModal.classList.add('hidden'); }

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
  const entry = show.source === 'tmdb'
    ? {
        id: `tmdb:${show.id}`,
        source: 'tmdb',
        tmdbId: show.id,
        name: show.name,
        premiered: show.premiered,
        watched: {},
        addedAt: new Date().toISOString(),
      }
    : {
        id: `tvmaze:${show.id}`,
        source: 'tvmaze',
        tvmazeId: show.id,
        name: show.name,
        premiered: show.premiered,
        watched: {},
        addedAt: new Date().toISOString(),
      };

  if (state.shows.some((item) => item.id === entry.id || (entry.tmdbId && item.tmdbId === entry.tmdbId))) {
    state.selectedId = state.shows.find((item) => item.id === entry.id || (entry.tmdbId && item.tmdbId === entry.tmdbId))?.id || state.selectedId;
    persistState();
    render();
    toast('That show is already in your lineup.');
    activateMobilePane('detail');
    return;
  }

  state.shows.unshift(entry);
  state.selectedId = entry.id;
  persistState();
  els.showSearch.value = '';
  await hydrateShow(entry.id, { force: true });
  render();
  activateMobilePane('detail');
}

async function refreshAllShows() {
  if (!state.shows.length) return;
  els.refreshAllBtn.disabled = true;
  els.refreshAllBtn.textContent = 'Refreshing…';
  try {
    for (const show of state.shows) {
      await hydrateShow(show.id, { force: true });
    }
    render();
    toast('Lineup refreshed.');
  } catch (err) {
    console.error(err);
    toast('Refresh hit a wall. Check your TMDb key in Settings.');
  } finally {
    els.refreshAllBtn.disabled = false;
    els.refreshAllBtn.textContent = 'Refresh all';
  }
}

async function hydrateShow(showId, { force = false } = {}) {
  const entry = state.shows.find((item) => item.id === showId);
  if (!entry) return null;
  const cacheKey = `${entry.id}|${state.settings.watchRegion}|${state.settings.castCount}|${Boolean(state.settings.tmdbApiKey)}`;
  if (!force && state.cache[cacheKey]) return state.cache[cacheKey];

  let bundle;
  if (entry.tmdbId || state.settings.tmdbApiKey) {
    bundle = await hydrateViaTmdb(entry);
  } else if (entry.tvmazeId) {
    bundle = await hydrateViaTvmaze(entry);
  } else {
    throw new Error('No usable show ID');
  }

  state.cache[cacheKey] = bundle;
  persistState();
  return bundle;
}

async function hydrateViaTmdb(entry) {
  const apiKey = state.settings.tmdbApiKey;
  if (!apiKey) throw new Error('TMDb key missing');
  let tmdbId = entry.tmdbId;
  if (!tmdbId) tmdbId = await findTmdbSeriesIdByName(entry.name, entry.premiered || '', apiKey);
  if (!tmdbId) throw new Error('Could not resolve TMDb ID');

  const [details, providers, credits] = await Promise.all([
    fetchJson(tmdbUrl(`/tv/${tmdbId}`, apiKey, { language: 'en-US' })),
    fetchJson(tmdbUrl(`/tv/${tmdbId}/watch/providers`, apiKey)),
    fetchJson(tmdbUrl(`/tv/${tmdbId}/aggregate_credits`, apiKey, { language: 'en-US' })),
  ]);

  entry.tmdbId = tmdbId;
  entry.name = details.name || entry.name;
  entry.poster = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : '';

  const showCastFallback = topCastFromAggregateCredits(credits, state.settings.castCount);
  const streaming = formatWatchProviders(providers, state.settings.watchRegion);
  const mainChannel = Array.isArray(details.networks) && details.networks.length ? details.networks[0].name : '';
  const nextEpisode = normalizeTmdbNextEpisode(details.next_episode_to_air);

  const seasons = Array.isArray(details.seasons) ? details.seasons.filter((s) => s && s.season_number > 0) : [];
  const seasonRows = [];
  for (const season of seasons) {
    const seasonNumber = season.season_number;
    const [seasonDetails, seasonCredits] = await Promise.all([
      fetchJson(tmdbUrl(`/tv/${tmdbId}/season/${seasonNumber}`, apiKey, { language: 'en-US' })),
      fetchJson(tmdbUrl(`/tv/${tmdbId}/season/${seasonNumber}/credits`, apiKey, { language: 'en-US' })),
    ]);

    const seasonCast = topCastFromSeasonCredits(seasonCredits, state.settings.castCount);
    const releaseDate = seasonDetails.air_date || season.air_date || (seasonNumber === 1 ? details.first_air_date || 'TBA' : 'TBA');
    const description = (seasonDetails.overview || '').trim() || (seasonNumber === 1 ? stripHtml(details.overview || '') : '');
    const nextEpisodeText = nextEpisode && Number(nextEpisode.season) === Number(seasonNumber) ? formatNextEpisode(nextEpisode) : '';

    seasonRows.push({
      season: seasonNumber,
      episodes: seasonDetails.episodes?.length || season.episode_count || '',
      releaseDate,
      description,
      cast: seasonCast.length ? seasonCast.join(', ') : showCastFallback.length ? `${showCastFallback.join(', ')} (series cast)` : '',
      platform: streaming,
      nextEpisode: nextEpisodeText,
    });
  }

  return {
    id: entry.id,
    source: 'tmdb',
    tmdbId,
    tvmazeId: entry.tvmazeId || null,
    show: {
      name: details.name || entry.name,
      image: { medium: entry.poster || '' },
      summary: details.overview || '',
      status: details.status || 'Unknown',
    },
    seasons: seasonRows,
    nextEpisode,
    mainChannel,
    streaming,
    refreshedAt: new Date().toISOString(),
  };
}

async function hydrateViaTvmaze(entry) {
  const showResp = await fetchJson(`https://api.tvmaze.com/shows/${entry.tvmazeId}`);
  const [seasonsResp, episodesResp, castResp] = await Promise.all([
    fetchJson(`https://api.tvmaze.com/shows/${entry.tvmazeId}/seasons`),
    fetchJson(`https://api.tvmaze.com/shows/${entry.tvmazeId}/episodes`),
    fetchJson(`https://api.tvmaze.com/shows/${entry.tvmazeId}/cast`),
  ]);
  let nextEpisode = null;
  if (showResp?._links?.nextepisode?.href) {
    try { nextEpisode = await fetchJson(showResp._links.nextepisode.href); } catch (_) {}
  }
  const fallbackCast = (castResp || []).map((item) => item?.person?.name).filter(Boolean).slice(0, state.settings.castCount);
  const episodeCounts = countEpisodesBySeason(episodesResp || []);
  const seasonRows = (seasonsResp || []).slice().sort((a,b)=>(a.number||0)-(b.number||0)).map((season, index) => ({
    season: season.number || null,
    episodes: episodeCounts[season.number] || season.episodeOrder || '',
    releaseDate: season.premiereDate || (index === 0 ? showResp.premiered || 'TBA' : 'TBA'),
    description: index === 0 ? stripHtml(showResp.summary || '') : '',
    cast: fallbackCast.length ? `${fallbackCast.join(', ')} (series cast)` : '',
    platform: '',
    nextEpisode: nextEpisode && Number(nextEpisode.season) === Number(season.number) ? formatNextEpisode(nextEpisode) : '',
  }));
  return {
    id: entry.id,
    source: 'tvmaze',
    tmdbId: entry.tmdbId || null,
    tvmazeId: entry.tvmazeId,
    show: showResp,
    seasons: seasonRows,
    nextEpisode,
    mainChannel: showResp.network?.name || showResp.webChannel?.name || '',
    streaming: '',
    refreshedAt: new Date().toISOString(),
  };
}

async function tmdbSearchShows(query) {
  const data = await fetchJson(tmdbUrl('/search/tv', state.settings.tmdbApiKey, { query, language: 'en-US' }));
  return Array.isArray(data?.results) ? data.results : [];
}

async function findTmdbSeriesIdByName(name, premiered, apiKey) {
  const results = await fetchJson(tmdbUrl('/search/tv', apiKey, { query: name, language: 'en-US' }));
  const list = Array.isArray(results?.results) ? results.results : [];
  if (!list.length) return null;
  const premieredYear = premiered?.slice?.(0,4) || '';
  let best = list[0];
  if (premieredYear) {
    const match = list.find((item) => item?.first_air_date?.slice(0,4) === premieredYear);
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

function normalizeTmdbNextEpisode(ep) {
  if (!ep) return null;
  return { season: ep.season_number, number: ep.episode_number, airdate: ep.air_date || '', airstamp: ep.air_date || '' };
}

function topCastFromAggregateCredits(credits, count) {
  const cast = Array.isArray(credits?.cast) ? credits.cast : [];
  return cast
    .slice()
    .sort((a, b) => (a?.order ?? 9999) - (b?.order ?? 9999))
    .map((item) => item?.name)
    .filter(Boolean)
    .slice(0, count);
}

function topCastFromSeasonCredits(credits, count) {
  const cast = Array.isArray(credits?.cast) ? credits.cast : [];
  return cast
    .slice()
    .sort((a, b) => (a?.order ?? 9999) - (b?.order ?? 9999))
    .map((item) => item?.name)
    .filter(Boolean)
    .slice(0, count);
}

function formatWatchProviders(payload, region) {
  const providers = payload?.results?.[region];
  if (!providers) return '';
  let names = [];
  if (Array.isArray(providers.flatrate) && providers.flatrate.length) names = providers.flatrate;
  else if (Array.isArray(providers.free) && providers.free.length) names = providers.free;
  else if (Array.isArray(providers.ads) && providers.ads.length) names = providers.ads;
  else if (Array.isArray(providers.rent) && providers.rent.length) names = providers.rent;
  else if (Array.isArray(providers.buy) && providers.buy.length) names = providers.buy;
  return [...new Set(names.map((item) => item?.provider_name).filter(Boolean))].join(', ');
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
  const date = episode?.airdate || (episode?.airstamp ? String(episode.airstamp).slice(0, 10) : 'TBA');
  return `${date} (S${episode?.season ?? '?'}E${episode?.number ?? '?'})`;
}

async function renderLineup() {
  if (!state.shows.length) {
    els.lineupGrid.className = 'lineup-grid empty-state-box';
    els.lineupGrid.innerHTML = '<p>No shows saved yet. Add one above and this stops acting like a spreadsheet.</p>';
    return;
  }

  els.lineupGrid.className = 'lineup-grid';
  els.lineupGrid.innerHTML = '';

  for (const entry of state.shows) {
    const bundle = await hydrateShow(entry.id).catch((err) => {
      console.error(err);
      return null;
    });
    if (!bundle) continue;
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
      state.selectedId = entry.id;
      persistState();
      renderSelectedDetail();
      activateMobilePane('detail');
    });
    card.querySelector('.lineup-card__refresh').addEventListener('click', async () => {
      await hydrateShow(entry.id, { force: true });
      render();
      toast(`Refreshed ${bundle.show?.name || entry.name}.`);
    });
    card.querySelector('.lineup-card__delete').addEventListener('click', () => removeShow(entry.id));

    if (state.selectedId === entry.id) card.style.outline = '2px solid rgba(124,156,255,.55)';
    els.lineupGrid.appendChild(card);
  }
}

function makeBadge(text, variant = '') {
  const span = document.createElement('span');
  span.className = `badge ${variant}`.trim();
  span.textContent = text;
  return span;
}

function removeShow(id) {
  state.shows = state.shows.filter((show) => show.id !== id);
  Object.keys(state.cache).filter((key) => key.startsWith(`${id}|`)).forEach((key) => delete state.cache[key]);
  if (state.selectedId === id) state.selectedId = state.shows[0]?.id || null;
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

  const bundle = await hydrateShow(state.selectedId).catch((err) => {
    console.error(err);
    els.detailEmpty.classList.remove('hidden');
    els.detailView.classList.add('hidden');
    els.detailView.innerHTML = '';
    toast('Could not load that show.');
    return null;
  });
  if (!bundle) return;
  const entry = state.shows.find((item) => item.id === state.selectedId);

  els.detailEmpty.classList.add('hidden');
  els.detailView.classList.remove('hidden');

  const poster = bundle.show?.image?.medium || 'https://placehold.co/400x600/11192f/eef4ff?text=TV';
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
          <div class="stat-card"><span class="label">Source</span><span class="value">${escapeHtml(bundle.source.toUpperCase())}</span></div>
          <div class="stat-card"><span class="label">Last refreshed</span><span class="value">${escapeHtml(formatDateTime(bundle.refreshedAt))}</span></div>
        </div>
      </div>
    </section>
    <section class="detail-table-wrap">
      <table class="detail-table">
        <thead>
          <tr>
            <th>Season</th><th>Episodes</th><th>Release</th><th>Description</th><th>Starring</th><th>Streaming</th><th>Next episode</th><th>Watched?</th>
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
      const showEntry = state.shows.find((item) => item.id === bundle.id);
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
    const bundle = await hydrateShow(show.id).catch(() => null);
    if (!bundle?.nextEpisode?.airdate) continue;
    items.push({
      name: bundle.show?.name || show.name,
      date: bundle.nextEpisode.airdate,
      season: bundle.nextEpisode.season,
      episode: bundle.nextEpisode.number,
      platform: bundle.streaming?.split(',')[0] || bundle.mainChannel || 'Unknown',
      id: show.id,
    });
  }

  items.sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
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
      <div class="upcoming-meta"><h3>${escapeHtml(item.name)}</h3><p>S${escapeHtml(String(item.season))}E${escapeHtml(String(item.episode))} · ${delta === 0 ? 'Drops today' : delta === 1 ? 'Drops tomorrow' : `Drops in ${delta} days`}</p></div>
      <div class="upcoming-service">${escapeHtml(item.platform)}</div>
    `;
    card.addEventListener('click', () => {
      state.selectedId = item.id;
      persistState();
      renderSelectedDetail();
      activateMobilePane('detail');
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
    if (Array.isArray(payload?.shows)) {
      state.shows = payload.shows.map((show) => ({ watched: {}, ...show, id: show.id || (show.tmdbId ? `tmdb:${show.tmdbId}` : show.tvmazeId ? `tvmaze:${show.tvmazeId}` : crypto.randomUUID()), source: show.source || (show.tmdbId ? 'tmdb' : 'tvmaze') }));
    }
    state.selectedId = state.shows[0]?.id || null;
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

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(html) {
  return (html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]*>/g, '').replace(/\n{3,}/g, '\n\n').trim();
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
function daysBetween(a,b){ return Math.round((b-a)/86400000); }
function escapeHtml(str) { return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function escapeAttr(str) { return escapeHtml(str); }

function toast(message) {
  console.log(message);
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 5000);
}

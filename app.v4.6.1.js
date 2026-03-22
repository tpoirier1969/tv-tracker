const APP_VERSION = 'v4.6.1';
const BUILD_DATE = '2026-03-22';
let lineupHydrationToken = 0;
const STORAGE_KEY = 'tv-lineup-tracker-state-v4-2';
const SETTINGS_STORAGE_KEY = 'tv-lineup-tracker-settings-v4-2';
const LEGACY_STATE_KEYS = ['tv-lineup-tracker-state-v4-2', 'tv-lineup-tracker-state', 'tv-lineup-tracker-state-v4', 'tv-lineup-tracker-state-v3'];
const LEGACY_SETTINGS_KEYS = ['tv-lineup-tracker-settings-v4-2', 'tv-lineup-tracker-settings', 'tv-lineup-tracker-state'];
const FETCH_TIMEOUT_MS = 9000;
const USER_COLORS = ['#7c9cff', '#8ef0d8', '#ffb347', '#ff7b91', '#bfa4ff', '#6fd4ff', '#8ed081', '#ffd166'];

const state = {
  settings: {
    tmdbApiKey: '',
    watchRegion: 'US',
    castCount: 4,
    supabaseUrl: '',
    supabaseKey: '',
    workspaceSlug: '',
  },
  users: [],
  shows: [],
  selectedId: null,
  assigningShowId: null,
  activeUserFilter: 'all',
  upcomingFilter: 'all',
  cache: {},
  mobilePane: 'lineup',
  sync: {
    mode: 'local',
    lastSyncAt: '',
    error: '',
  },
};

const els = {};
let toastTimer = null;
let syncInFlight = false;
let activeModal = null;

window.forceCloseTvTrackerModals = function forceCloseTvTrackerModals() {
  closeAddShowModal();
  closeSettings();
  closeUsersModal();
  closeAssignModal();
  closeChooser();
};

document.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => {
    console.error(err);
    toast(`Startup hit a wall: ${err.message || err}`);
  });
});

async function init() {
  cacheElements();
  loadState();
  bindEvents();
  hydrateStaticUi();
  renderUserFilters();
  renderUsersList();
  renderSyncStatus();
  render();
  if (hasSupabaseConfig()) {
    await syncCloudState({ initial: true });
  }
  if (els.headerAddShowBtn && window.innerWidth > 980) els.headerAddShowBtn.focus();
}

function cacheElements() {
  els.addShowForm = document.getElementById('addShowForm');
  els.showSearch = document.getElementById('showSearch');
  els.headerAddShowBtn = document.getElementById('headerAddShowBtn');
  els.lineupAddBtn = document.getElementById('lineupAddBtn');
  els.addShowModal = document.getElementById('addShowModal');
  els.lineupGrid = document.getElementById('lineupGrid');
  els.lineupScopeLabel = document.getElementById('lineupScopeLabel');
  els.lineupCountPill = document.getElementById('lineupCountPill');
  els.lineupFilterChips = document.getElementById('lineupFilterChips');
  els.userFilterLabel = document.getElementById('userFilterLabel');
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
  els.supabaseUrlInput = document.getElementById('supabaseUrlInput');
  els.supabaseKeyInput = document.getElementById('supabaseKeyInput');
  els.workspaceSlugInput = document.getElementById('workspaceSlugInput');

  els.manageUsersBtn = document.getElementById('manageUsersBtn');
  els.usersModal = document.getElementById('usersModal');
  els.userForm = document.getElementById('userForm');
  els.userNameInput = document.getElementById('userNameInput');
  els.usersList = document.getElementById('usersList');
  els.userFilterChips = document.getElementById('userFilterChips');

  els.assignModal = document.getElementById('assignModal');
  els.assignModalTitle = document.getElementById('assignModalTitle');
  els.assignChecklist = document.getElementById('assignChecklist');
  els.assignForm = document.getElementById('assignForm');

  els.syncNowBtn = document.getElementById('syncNowBtn');
  els.syncStatusPill = document.getElementById('syncStatusPill');
  els.exportBtn = document.getElementById('exportBtn');
  els.importFile = document.getElementById('importFile');
  els.exportConfigBtn = document.getElementById('exportConfigBtn');
  els.copyConfigBtn = document.getElementById('copyConfigBtn');
  els.settingsExportConfigBtn = document.getElementById('settingsExportConfigBtn');
  els.settingsCopyConfigBtn = document.getElementById('settingsCopyConfigBtn');
  els.syncErrorDetail = document.getElementById('syncErrorDetail');
  els.toast = document.getElementById('toast');
  els.mobileTabs = [...document.querySelectorAll('[data-mobile-pane-button]')];
  els.versionFlag = document.getElementById('versionFlag');
  els.footerVersion = document.getElementById('footerVersion');
}


function exportConfigFile() {
  if (typeof window.buildRuntimeConfigSource !== 'function') {
    toast('config.js export is unavailable in this build. Keep using your existing config.js.', 3200);
    return;
  }
  const source = window.buildRuntimeConfigSource();
  const blob = new Blob([source], { type: 'application/javascript;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'config.js';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('config.js exported.', 1800);
}

function copyConfigToClipboard() {
  if (typeof window.buildRuntimeConfigSource !== 'function') {
    toast('config.js copy is unavailable in this build.', 2800);
    return;
  }
  const source = window.buildRuntimeConfigSource();
  navigator.clipboard.writeText(source)
    .then(() => toast('config.js copied to clipboard.', 1800))
    .catch((err) => {
      console.error('Copy config failed:', err);
      toast('Could not copy config.js.', 2400);
    });
}

function bindEvents() {
  els.addShowForm.addEventListener('submit', onAddShowSubmit);
  els.refreshAllBtn.addEventListener('click', refreshAllShows);
  els.headerAddShowBtn?.addEventListener('click', openAddShowModal);
  els.lineupAddBtn?.addEventListener('click', openAddShowModal);
  els.settingsBtn.addEventListener('click', openSettings);
  els.settingsForm.addEventListener('submit', saveSettings);
  els.manageUsersBtn.addEventListener('click', openUsersModal);
  els.userForm.addEventListener('submit', onAddUserSubmit);
  els.assignForm.addEventListener('submit', saveAssignment);
  els.exportBtn.addEventListener('click', exportState);
  els.exportConfigBtn?.addEventListener('click', exportConfigFile);
  els.copyConfigBtn?.addEventListener('click', copyConfigToClipboard);
  els.settingsExportConfigBtn?.addEventListener('click', exportConfigFile);
  els.settingsCopyConfigBtn?.addEventListener('click', copyConfigToClipboard);
  els.importFile.addEventListener('change', importStateFile);
  els.syncNowBtn.addEventListener('click', () => syncCloudState({ initial: false, manual: true }));

    document.querySelectorAll('[data-lineup-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.upcomingFilter = btn.dataset.lineupFilter;
      document.querySelectorAll('[data-lineup-filter]').forEach((chip) => chip.classList.toggle('active', chip === btn));
      persistState();
      render();
    });
  });
  els.mobileTabs.forEach((btn) => btn.addEventListener('click', () => activateMobilePane(btn.dataset.mobilePaneButton)));

  document.addEventListener('keydown', onGlobalKeydown);
  document.addEventListener('click', onDocumentClick);
  bindDirectModalControls();
}

function bindDirectModalControls() {
  document.querySelectorAll('[data-close-add-show]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeAddShowModal();
    });
  });
  document.querySelectorAll('[data-close-settings]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeSettings();
    });
  });
  document.querySelectorAll('[data-close-users]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeUsersModal();
    });
  });
  document.querySelectorAll('[data-close-assign]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeAssignModal();
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeChooser();
    });
  });
}

function onDocumentClick(event) {
  const closeTrigger = event.target.closest('[data-close-modal], [data-close-settings], [data-close-users], [data-close-assign], [data-close-add-show]');
  if (closeTrigger) {
    event.preventDefault();
    event.stopPropagation();
    if (closeTrigger.hasAttribute('data-close-add-show')) return closeAddShowModal();
    if (closeTrigger.hasAttribute('data-close-settings')) return closeSettings();
    if (closeTrigger.hasAttribute('data-close-users')) return closeUsersModal();
    if (closeTrigger.hasAttribute('data-close-assign')) return closeAssignModal();
    if (closeTrigger.hasAttribute('data-close-modal')) return closeChooser();
  }
}

function setModalVisibility(modalEl, isOpen) {
  if (!modalEl) return;
  modalEl.classList.toggle('hidden', !isOpen);
  modalEl.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
}

function onGlobalKeydown(event) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  closeTopModal();
}

function closeTopModal() {
  switch (activeModal) {
    case 'add-show':
      closeAddShowModal();
      break;
    case 'chooser':
      closeChooser();
      break;
    case 'settings':
      closeSettings();
      break;
    case 'users':
      closeUsersModal();
      break;
    case 'assign':
      closeAssignModal();
      break;
    default:
      break;
  }
}

function hydrateStaticUi() {
  if (els.versionFlag) els.versionFlag.textContent = `${APP_VERSION} · ${BUILD_DATE}`;
  if (els.footerVersion) els.footerVersion.textContent = `${APP_VERSION} · ${BUILD_DATE}`;
  activateMobilePane(state.mobilePane || 'lineup', { persist: false });
  document.querySelectorAll('[data-lineup-filter]').forEach((chip) => chip.classList.toggle('active', chip.dataset.lineupFilter === state.upcomingFilter));
}

function loadState() {
  try {
    const raw = getFirstAvailableStorage_(LEGACY_STATE_KEYS);
    if (raw) {
      const parsed = JSON.parse(raw);
      mergeLoadedState(parsed);
    }

    const settingsRaw = getFirstAvailableStorage_(LEGACY_SETTINGS_KEYS);
    if (settingsRaw) {
      const savedSettings = JSON.parse(settingsRaw);
      state.settings = { ...state.settings, ...savedSettings };
    }

    normalizeState();
  } catch (err) {
    console.warn('Could not load saved state', err);
  }
}

function mergeLoadedState(parsed) {
  if (!parsed || typeof parsed !== 'object') return;
  if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
  if (Array.isArray(parsed.users)) state.users = parsed.users;
  if (Array.isArray(parsed.shows)) state.shows = parsed.shows;
  state.selectedId = parsed.selectedId || state.selectedId;
  state.activeUserFilter = parsed.activeUserFilter || state.activeUserFilter;
  state.upcomingFilter = parsed.upcomingFilter || state.upcomingFilter;
  state.mobilePane = parsed.mobilePane || state.mobilePane;
  if (parsed.sync) state.sync = { ...state.sync, ...parsed.sync };
}

function normalizeState() {
  state.settings.tmdbApiKey = String(state.settings.tmdbApiKey || '').trim();
  state.settings.watchRegion = String(state.settings.watchRegion || 'US').trim().toUpperCase() || 'US';
  state.settings.castCount = Math.max(1, Math.min(10, Number(state.settings.castCount || 4)));
  state.settings.supabaseUrl = normalizeSupabaseUrl(state.settings.supabaseUrl || '');
  state.settings.supabaseKey = normalizeApiKey(state.settings.supabaseKey || '');
  state.settings.workspaceSlug = normalizeWorkspaceSlug(state.settings.workspaceSlug || '');

  const dedupedUsers = dedupeUsers((state.users || []).map((user, index) => normalizeUser(user, index)));
  state.users = dedupedUsers.users;
  state.shows = (state.shows || []).map((show) => remapShowUserIds(normalizeShow(show), dedupedUsers.idMap)).sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));

  if (state.activeUserFilter !== 'all' && !state.users.some((user) => user.id === state.activeUserFilter)) {
    state.activeUserFilter = 'all';
  }
  if (!state.selectedId || !state.shows.some((show) => show.id === state.selectedId)) {
    state.selectedId = state.shows[0]?.id || null;
  }
}

function dedupeUsers(users = []) {
  const normalizedUsers = users.map((user, index) => normalizeUser(user, index));
  const byName = new Map();
  const idMap = new Map();
  for (const user of normalizedUsers) {
    const key = normalizeTitle(user.name);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, user);
      idMap.set(user.id, user.id);
      continue;
    }
    const preferred = isNewerRecord(user, existing) ? user : existing;
    byName.set(key, preferred);
    idMap.set(existing.id, preferred.id);
    idMap.set(user.id, preferred.id);
  }
  const usersOut = [...byName.values()]
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))
    .map((user, index) => ({ ...user, sortOrder: index }));
  usersOut.forEach((user) => idMap.set(user.id, user.id));
  const kept = new Set(usersOut.map((user) => user.id));
  const removedIds = normalizedUsers.map((user) => user.id).filter((id) => !kept.has(id));
  return { users: usersOut, idMap, removedIds };
}

function remapShowUserIds(show, idMap = new Map()) {
  const assignedUserIds = normalizeAssignedUserIds(show.assignedUserIds).map((id) => idMap.get(id) || id);
  return { ...show, assignedUserIds: [...new Set(assignedUserIds)] };
}

function normalizeUser(user, index = 0) {
  return {
    id: user?.id || makeId('user'),
    name: String(user?.name || `User ${index + 1}`).trim(),
    color: user?.color || USER_COLORS[index % USER_COLORS.length],
    sortOrder: Number.isFinite(Number(user?.sortOrder)) ? Number(user.sortOrder) : index,
    createdAt: user?.createdAt || user?.created_at || new Date().toISOString(),
    updatedAt: user?.updatedAt || user?.updated_at || new Date().toISOString(),
  };
}

function normalizeShow(show) {
  const tmdbId = show?.tmdbId ?? show?.tmdb_id ?? null;
  const tvmazeId = show?.tvmazeId ?? show?.tvmaze_id ?? null;
  return {
    watched: {},
    assignedUserIds: [],
    ...show,
    id: show?.id || (tmdbId ? `tmdb:${tmdbId}` : tvmazeId ? `tvmaze:${tvmazeId}` : makeId('show')),
    source: show?.source || (tmdbId ? 'tmdb' : 'tvmaze'),
    tmdbId,
    tvmazeId,
    watched: normalizeWatchedMap(show?.watched),
    assignedUserIds: normalizeAssignedUserIds(show?.assignedUserIds ?? show?.assigned_user_ids),
    addedAt: show?.addedAt || show?.added_at || new Date().toISOString(),
    updatedAt: show?.updatedAt || show?.updated_at || new Date().toISOString(),
  };
}

function normalizeWatchedMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

function normalizeAssignedUserIds(value) {
  if (Array.isArray(value)) return [...new Set(value.map(String).filter(Boolean))];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? [...new Set(parsed.map(String).filter(Boolean))] : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function persistState() {
  const payload = {
    settings: state.settings,
    users: state.users,
    shows: state.shows,
    selectedId: state.selectedId,
    activeUserFilter: state.activeUserFilter,
    upcomingFilter: state.upcomingFilter,
    mobilePane: state.mobilePane,
    sync: state.sync,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
}

function getFirstAvailableStorage_(keys) {
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (raw) return raw;
  }
  return null;
}

function activateMobilePane(name, { persist = true } = {}) {
  state.mobilePane = name;
  document.querySelectorAll('[data-mobile-pane]').forEach((el) => el.classList.toggle('active-pane', el.dataset.mobilePane === name));
  els.mobileTabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.mobilePaneButton === name));
  if (persist) persistState();
}

function render() {
  renderUserFilters();
  renderUsersList();
  renderLineup();
  renderSelectedDetail();
  renderStats();
  renderSyncStatus();
}

function renderStats() {
  if (els.lineupScopeLabel) {
    const scopeBits = [state.activeUserFilter === 'all' ? 'All users' : getActiveUserLabel(), state.upcomingFilter === '21' ? 'Scheduled next 3 weeks' : 'All shows'];
    els.lineupScopeLabel.textContent = scopeBits.join(' · ');
  }
}

function renderUserFilters() {
  if (!els.userFilterChips) return;
  els.userFilterChips.innerHTML = '';
  const chips = [{ id: 'all', name: 'All users', color: '' }, ...state.users];
  chips.forEach((user) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = user.name;
    button.classList.toggle('active', state.activeUserFilter === user.id);
    if (user.color) button.style.borderColor = `${user.color}55`;
    button.addEventListener('click', () => {
      state.activeUserFilter = user.id;
      persistState();
      render();
    });
    els.userFilterChips.appendChild(button);
  });

  if (els.userFilterLabel) {
    els.userFilterLabel.textContent = state.activeUserFilter === 'all' ? 'Viewing as: everybody' : `Viewing as: ${getActiveUserLabel()}`;
  }
}

function renderUsersList() {
  if (!els.usersList) return;
  if (!state.users.length) {
    els.usersList.className = 'users-list empty-state-box';
    els.usersList.innerHTML = '<p>No users yet. Add one and start assigning shows.</p>';
    return;
  }

  els.usersList.className = 'users-list';
  els.usersList.innerHTML = '';
  state.users.forEach((user) => {
    const card = document.createElement('article');
    card.className = 'user-row';
    const showCount = state.shows.filter((show) => show.assignedUserIds.includes(user.id)).length;
    card.innerHTML = `
      <div class="user-row__main">
        <span class="user-dot" style="background:${escapeAttr(user.color)}"></span>
        <div>
          <div class="user-row__name">${escapeHtml(user.name)}</div>
          <div class="user-row__meta">${showCount} assigned show${showCount === 1 ? '' : 's'}</div>
        </div>
      </div>
      <button type="button" class="ghost-btn small" data-remove-user="${escapeAttr(user.id)}">Remove</button>
    `;
    card.querySelector('[data-remove-user]').addEventListener('click', () => removeUser(user.id));
    els.usersList.appendChild(card);
  });
}

async function onAddUserSubmit(event) {
  event.preventDefault();
  const name = String(els.userNameInput.value || '').trim();
  if (!name) {
    toast('Give the user a name first.');
    return;
  }

  const existing = state.users.find((user) => normalizeTitle(user.name) === normalizeTitle(name));
  if (existing) {
    state.activeUserFilter = existing.id;
    persistState();
    render();
    toast(`${existing.name} already exists.`);
    return;
  }

  const user = normalizeUser({ name, color: nextUserColor(), sortOrder: state.users.length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, state.users.length);
  state.users.push(user);
  state.activeUserFilter = user.id;
  persistState();
  render();
  els.userNameInput.value = '';

  if (hasSupabaseConfig()) {
    try {
      await upsertRemoteUsers([user]);
      markSyncSuccess();
    } catch (err) {
      console.error(err);
      markSyncError(err);
      toast(`User added locally, but cloud sync failed: ${friendlySyncError(err)}`);
      return;
    }
  }

  toast(`${user.name} added.`);
}

async function removeUser(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  const ok = window.confirm(`Remove ${user.name}? Shows stay saved, but that user will be removed from assignments.`);
  if (!ok) return;

  state.users = state.users.filter((item) => item.id !== userId).map((item, index) => ({ ...item, sortOrder: index, updatedAt: new Date().toISOString() }));
  const changedShows = [];
  state.shows.forEach((show) => {
    if (!show.assignedUserIds.includes(userId)) return;
    show.assignedUserIds = show.assignedUserIds.filter((id) => id !== userId);
    show.updatedAt = new Date().toISOString();
    changedShows.push(show);
  });
  if (state.activeUserFilter === userId) state.activeUserFilter = 'all';
  persistState();
  render();

  if (hasSupabaseConfig()) {
    try {
      await deleteRemoteUser(userId);
      if (changedShows.length) await upsertRemoteShows(changedShows);
      markSyncSuccess();
    } catch (err) {
      console.error(err);
      markSyncError(err);
      toast(`Removed locally, but cloud sync failed: ${friendlySyncError(err)}`);
      return;
    }
  }

  toast(`${user.name} removed.`);
}

function openUsersModal() {
  renderUsersList();
  activeModal = 'users';
  setModalVisibility(els.usersModal, true);
}

function closeUsersModal() {
  if (activeModal === 'users') activeModal = null;
  setModalVisibility(els.usersModal, false);
}

function openAssignModal(showId) {
  state.assigningShowId = showId;
  const show = state.shows.find((item) => item.id === showId);
  if (!show) return;
  els.assignModalTitle.textContent = `Choose who should see “${show.name}” in their filtered lineup.`;
  renderAssignChecklist(show);
  activeModal = 'assign';
  setModalVisibility(els.assignModal, true);
}

function closeAssignModal() {
  state.assigningShowId = null;
  if (activeModal === 'assign') activeModal = null;
  setModalVisibility(els.assignModal, false);
}

function renderAssignChecklist(show) {
  if (!state.users.length) {
    els.assignChecklist.className = 'assign-checklist empty-state-box';
    els.assignChecklist.innerHTML = '<p>Add at least one user first.</p>';
    return;
  }

  els.assignChecklist.className = 'assign-checklist';
  els.assignChecklist.innerHTML = '';
  state.users.forEach((user) => {
    const label = document.createElement('label');
    label.className = 'assign-option';
    label.innerHTML = `
      <input type="checkbox" value="${escapeAttr(user.id)}" ${show.assignedUserIds.includes(user.id) ? 'checked' : ''}>
      <span class="user-dot" style="background:${escapeAttr(user.color)}"></span>
      <span>${escapeHtml(user.name)}</span>
    `;
    els.assignChecklist.appendChild(label);
  });
}

async function saveAssignment(event) {
  event.preventDefault();
  const show = state.shows.find((item) => item.id === state.assigningShowId);
  if (!show) return;
  const selected = [...els.assignChecklist.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  show.assignedUserIds = normalizeAssignedUserIds(selected);
  show.updatedAt = new Date().toISOString();
  persistState();
  closeAssignModal();
  render();

  if (hasSupabaseConfig()) {
    try {
      await upsertRemoteShows([show]);
      markSyncSuccess();
    } catch (err) {
      console.error(err);
      markSyncError(err);
      toast(`Assignment saved locally, but cloud sync failed: ${friendlySyncError(err)}`);
      return;
    }
  }

  toast(`Updated users for ${show.name}.`);
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
  activeModal = 'chooser';
  setModalVisibility(els.chooserModal, true);
}

function closeChooser() {
  if (activeModal === 'chooser') activeModal = null;
  setModalVisibility(els.chooserModal, false);
}

function openSettings() {
  els.tmdbKeyInput.value = state.settings.tmdbApiKey || '';
  els.watchRegionInput.value = state.settings.watchRegion || 'US';
  els.castCountInput.value = state.settings.castCount || 4;
  els.supabaseUrlInput.value = state.settings.supabaseUrl || '';
  els.supabaseKeyInput.value = state.settings.supabaseKey || '';
  els.workspaceSlugInput.value = state.settings.workspaceSlug || '';
  activeModal = 'settings';
  setModalVisibility(els.settingsModal, true);
}

function closeSettings() {
  if (activeModal === 'settings') activeModal = null;
  setModalVisibility(els.settingsModal, false);
}

async function saveSettings(event) {
  event.preventDefault();
  const oldSyncFingerprint = syncFingerprint();

  state.settings.tmdbApiKey = String(els.tmdbKeyInput.value || '').trim();
  state.settings.watchRegion = (String(els.watchRegionInput.value || 'US').trim() || 'US').toUpperCase();
  state.settings.castCount = Math.max(1, Math.min(10, Number(els.castCountInput.value || 4)));
  state.settings.supabaseUrl = normalizeSupabaseUrl(String(els.supabaseUrlInput.value || ''));
  state.settings.supabaseKey = normalizeApiKey(String(els.supabaseKeyInput.value || ''));
  state.settings.workspaceSlug = normalizeWorkspaceSlug(els.workspaceSlugInput.value || '');
  state.cache = {};
  persistState();
  closeSettings();
  render();

  const newSyncFingerprint = syncFingerprint();
  if (hasSupabaseConfig()) {
    toast('Settings saved. Connecting to Supabase…');
    await syncCloudState({ initial: oldSyncFingerprint !== newSyncFingerprint, manual: true });
  } else {
    state.sync = { mode: 'local', lastSyncAt: '', error: '' };
    persistState();
    renderSyncStatus();
    toast('Settings saved locally. Add Supabase details when you want cross-device sync.');
  }

  refreshAllShows();
}

function syncFingerprint() {
  return [state.settings.supabaseUrl, state.settings.supabaseKey, state.settings.workspaceSlug].join('|');
}

function getActiveUserLabel() {
  if (state.activeUserFilter === 'all') return 'All users';
  return state.users.find((user) => user.id === state.activeUserFilter)?.name || 'All users';
}

function getUserScopedShows() {
  return state.activeUserFilter === 'all'
    ? state.shows
    : state.shows.filter((show) => show.assignedUserIds.includes(state.activeUserFilter));
}

function showScheduledInNext21(show, bundle = null) {
  const resolved = bundle || getCachedBundleForShow(show);
  const airdate = resolved?.nextEpisode?.airdate;
  if (!airdate) return false;
  const dt = new Date(`${airdate}T00:00:00`);
  const delta = daysBetween(startOfToday(), dt);
  return delta >= 0 && delta <= 21;
}

function getVisibleShows() {
  const scoped = getUserScopedShows();
  if (state.upcomingFilter !== '21') return scoped;
  return scoped.filter((show) => showScheduledInNext21(show));
}

function getAssignedUsers(show) {
  return state.users.filter((user) => show.assignedUserIds.includes(user.id));
}

function getDefaultAssignedUsersForNewShow() {
  if (state.activeUserFilter !== 'all' && state.users.some((user) => user.id === state.activeUserFilter)) {
    return [state.activeUserFilter];
  }
  if (state.users.length === 1) return [state.users[0].id];
  return [];
}

function openAddShowModal() {
  activeModal = 'add-show';
  setModalVisibility(els.addShowModal, true);
  window.setTimeout(() => els.showSearch?.focus(), 40);
}

function closeAddShowModal({ clear = false } = {}) {
  setFormBusy(false);
  if (clear && els.showSearch) els.showSearch.value = '';
  if (activeModal === 'add-show') activeModal = null;
  setModalVisibility(els.addShowModal, false);
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
      closeAddShowModal({ clear: true });
      return;
    }

    closeAddShowModal();
    openChooser(choice.candidates);
  } catch (err) {
    console.error(err);
    toast('Search failed. TMDb key missing or network blocked. Open Settings and paste your TMDb key.');
  } finally {
    setFormBusy(false);
  }
}

function setFormBusy(isBusy) {
  const button = els.addShowForm?.querySelector('button');
  if (button) {
    button.disabled = isBusy;
    button.textContent = isBusy ? 'Searching…' : 'Add to lineup';
  }
  if (els.showSearch) els.showSearch.disabled = isBusy;
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
  return String(value || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
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

async function addShowToLineup(show) {
  const now = new Date().toISOString();
  const entry = show.source === 'tmdb'
    ? normalizeShow({
        id: `tmdb:${show.id}`,
        source: 'tmdb',
        tmdbId: show.id,
        name: show.name,
        premiered: show.premiered,
        watched: {},
        assignedUserIds: getDefaultAssignedUsersForNewShow(),
        addedAt: now,
        updatedAt: now,
      })
    : normalizeShow({
        id: `tvmaze:${show.id}`,
        source: 'tvmaze',
        tvmazeId: show.id,
        name: show.name,
        premiered: show.premiered,
        watched: {},
        assignedUserIds: getDefaultAssignedUsersForNewShow(),
        addedAt: now,
        updatedAt: now,
      });

  const duplicate = findDuplicateShow(entry);
  if (duplicate) {
    state.selectedId = duplicate.id;
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

  if (hasSupabaseConfig()) {
    try {
      await upsertRemoteShows([entry]);
      markSyncSuccess();
    } catch (err) {
      console.error(err);
      markSyncError(err);
      toast(`Saved locally, but cloud sync failed: ${friendlySyncError(err)}`);
    }
  }

  await hydrateShow(entry.id, { force: true });
  closeAddShowModal();
  render();
  activateMobilePane('detail');
}

function findDuplicateShow(entry) {
  const entryNorm = normalizeTitle(entry.name);
  const entryYear = String(entry.premiered || '').slice(0, 4);
  return state.shows.find((item) => {
    if (item.id === entry.id) return true;
    if (entry.tmdbId && item.tmdbId && Number(entry.tmdbId) === Number(item.tmdbId)) return true;
    if (normalizeTitle(item.name) !== entryNorm) return false;
    const itemYear = String(item.premiered || '').slice(0, 4);
    return !entryYear || !itemYear || entryYear === itemYear;
  }) || null;
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
  return bundle;
}

function getCachedBundleForShow(show) {
  const cacheKey = `${show.id}|${state.settings.watchRegion}|${state.settings.castCount}|${Boolean(state.settings.tmdbApiKey)}`;
  return state.cache[cacheKey] || null;
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
    const description = String((seasonDetails.overview || '').trim() || (seasonNumber === 1 ? stripHtml(details.overview || '') : ''));
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
      lastAirDate: details.last_air_date || '',
      inProduction: Boolean(details.in_production),
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
  const seasonRows = (seasonsResp || []).slice().sort((a, b) => (a.number || 0) - (b.number || 0)).map((season, index) => ({
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
    show: { ...showResp, lastAirDate: showResp.ended || '', inProduction: /running|to be determined|in development/i.test(String(showResp.status || '')) },
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
  const premieredYear = premiered?.slice?.(0, 4) || '';
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

function uniqueBits(...bits) {
  const seen = new Set();
  return bits.filter(Boolean).filter((bit) => {
    const key = normalizeTitle(String(bit));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferLineupStatus(entry, bundle) {
  if (bundle?.nextEpisode) {
    return {
      variant: 'scheduled',
      text: `Next scheduled: ${formatNextEpisode(bundle.nextEpisode)}`,
    };
  }

  const rawStatus = String(bundle?.show?.status || '').toLowerCase();
  const lastAirDate = bundle?.show?.lastAirDate || bundle?.show?.ended || entry.lastAirDate || entry.ended || '';
  const inProduction = Boolean(bundle?.show?.inProduction);

  if (rawStatus.includes('ended')) return { variant: 'ended', text: 'Series ended.' };
  if (rawStatus.includes('cancel')) return { variant: 'ended', text: 'Series canceled.' };
  if (rawStatus.includes('returning') || rawStatus.includes('planned') || rawStatus.includes('production') || inProduction) {
    return { variant: 'returning', text: 'New season expected, but no release date is announced yet.' };
  }

  if (lastAirDate) {
    const last = new Date(lastAirDate);
    const ageDays = Number.isFinite(last.getTime()) ? Math.floor((Date.now() - last.getTime()) / 86400000) : null;
    if (ageDays !== null && ageDays > 730) {
      return { variant: 'ended', text: 'Likely ended — no new episode in over 2 years.' };
    }
  }

  return bundle
    ? { variant: '', text: 'No known scheduled episode date right now.' }
    : { variant: '', text: 'Loading details…' };
}

function buildLineupMeta(entry, bundle) {
  const seasonCount = (bundle?.seasons?.length ?? Number(entry.seasonCount || 0) ?? 0);
  const seasonText = `${seasonCount || '—'} season${seasonCount === 1 ? '' : 's'}`;
  const availability = uniqueBits(bundle?.mainChannel || entry.network || '', bundle?.streaming || entry.streaming || '');
  return uniqueBits(seasonText, ...availability).join(' · ');
}

function queueLineupHydration(shows) {
  const uncached = shows.filter((show) => !getCachedBundleForShow(show));
  if (!uncached.length) return;
  const token = ++lineupHydrationToken;
  const concurrency = Math.min(6, Math.max(2, uncached.length >= 12 ? 6 : 3));
  let index = 0;
  let changed = false;
  let rerenderQueued = false;

  const queueRerender = () => {
    if (rerenderQueued || token !== lineupHydrationToken) return;
    rerenderQueued = true;
    setTimeout(() => {
      rerenderQueued = false;
      if (token === lineupHydrationToken) render();
    }, 0);
  };

  const worker = async () => {
    while (token === lineupHydrationToken) {
      const show = uncached[index++];
      if (!show) return;
      try {
        await hydrateShow(show.id);
        changed = true;
        queueRerender();
      } catch (err) {
        console.error('Lineup hydration failed for', show.name || show.id, err);
      }
    }
  };

  Promise.allSettled(Array.from({ length: concurrency }, () => worker())).then(() => {
    if (changed && token === lineupHydrationToken) render();
  });
}

function renderLineup() {
  try {
    const scopedShows = getUserScopedShows();
    const visibleShows = [];
    for (const show of scopedShows) {
      const bundle = getCachedBundleForShow(show);
      if (state.upcomingFilter === '21' && bundle && !showScheduledInNext21(show, bundle)) continue;
      if (state.upcomingFilter === '21' && !bundle) {
        visibleShows.push({ entry: show, bundle: null });
        continue;
      }
      visibleShows.push({ entry: show, bundle });
    }
    queueLineupHydration(scopedShows);
    if (els.lineupCountPill) els.lineupCountPill.textContent = `${visibleShows.length} visible`;
    const title = document.getElementById('lineupTitleText');
    if (title) title.textContent = state.upcomingFilter === '21' ? `Lineup · ${visibleShows.length} scheduled next 3 weeks` : 'Lineup';
    if (!visibleShows.length) {
      els.lineupGrid.className = 'lineup-grid empty-state-box';
      els.lineupGrid.innerHTML = state.activeUserFilter === 'all'
        ? '<p>No shows match this lineup filter yet.</p>'
        : `<p>No shows match this filter for ${escapeHtml(getActiveUserLabel())} yet.</p>`;
      return;
    }

    els.lineupGrid.className = 'lineup-grid';
    els.lineupGrid.innerHTML = '';

    for (const { entry, bundle } of visibleShows) {
      try {
        const template = document.getElementById('lineupCardTemplate');
        const card = template.content.firstElementChild.cloneNode(true);
        const titleEl = card.querySelector('.lineup-card__title');
        const metaEl = card.querySelector('.lineup-card__meta');
        const assignedEl = card.querySelector('.lineup-card__assigned');
        const nextEl = card.querySelector('.lineup-card__next');

        const assignedUsers = getAssignedUsers(entry);
        const status = inferLineupStatus(entry, bundle);

        titleEl.textContent = bundle?.show?.name || entry.name || 'Untitled show';
        metaEl.innerHTML = `<strong>Details:</strong> ${escapeHtml(buildLineupMeta(entry, bundle) || 'Details still loading')}`;
        assignedEl.innerHTML = `<strong>Users:</strong> ${escapeHtml(assignedUsers.length ? assignedUsers.map((user) => user.name).join(', ') : (state.users.length ? 'Unassigned' : 'Shared lineup'))}`;
        nextEl.innerHTML = `<strong>Status:</strong> ${escapeHtml(status.text)}`;
        if (status.variant) card.classList.add(`lineup-card--${status.variant}`);

        card.querySelector('.lineup-card__open').addEventListener('click', () => {
          state.selectedId = entry.id;
          persistState();
          renderSelectedDetail();
          activateMobilePane('detail');
        });
        card.querySelector('.lineup-card__assign').addEventListener('click', () => openAssignModal(entry.id));
        card.querySelector('.lineup-card__delete').addEventListener('click', () => removeShow(entry.id));

        if (state.selectedId === entry.id) card.style.outline = '2px solid rgba(124,156,255,.55)';
        els.lineupGrid.appendChild(card);
      } catch (cardErr) {
        console.error('Could not render lineup card for', entry?.name || entry?.id, cardErr);
        const fallback = document.createElement('article');
        fallback.className = 'lineup-card lineup-card--ended';
        fallback.innerHTML = `<div class="lineup-card__body"><div class="lineup-card__title-row"><h3 class="lineup-card__title">${escapeHtml(entry?.name || 'Show')}</h3></div><p class="lineup-card__next"><strong>Status:</strong> Could not draw this card cleanly.</p></div>`;
        els.lineupGrid.appendChild(fallback);
      }
    }
  } catch (err) {
    console.error('renderLineup failed:', err);
    els.lineupGrid.className = 'lineup-grid empty-state-box';
    els.lineupGrid.innerHTML = '<p>Lineup failed to draw. Try Sync now or reload.</p>';
    toast('Lineup draw failed. Check console for details.');
  }
}

function makeBadge(text, variant = '', color = '') {
  const span = document.createElement('span');
  span.className = `badge ${variant}`.trim();
  span.textContent = text;
  if (color) {
    span.style.borderColor = `${color}55`;
    span.style.background = `${color}1a`;
  }
  return span;
}

async function removeShow(id) {
  const show = state.shows.find((item) => item.id === id);
  if (!show) return;
  const ok = window.confirm(`Remove ${show.name} from the lineup?`);
  if (!ok) return;

  state.shows = state.shows.filter((item) => item.id !== id);
  Object.keys(state.cache).filter((key) => key.startsWith(`${id}|`)).forEach((key) => delete state.cache[key]);
  if (state.selectedId === id) state.selectedId = getVisibleShows()[0]?.id || state.shows[0]?.id || null;
  persistState();
  render();

  if (hasSupabaseConfig()) {
    try {
      await deleteRemoteShow(id);
      markSyncSuccess();
    } catch (err) {
      console.error(err);
      markSyncError(err);
      toast(`Removed locally, but cloud sync failed: ${friendlySyncError(err)}`);
      return;
    }
  }

  toast(`${show.name} removed.`);
}

async function renderSelectedDetail() {
  const selected = state.shows.find((item) => item.id === state.selectedId);
  if (!selected) {
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
  const assignedUsers = getAssignedUsers(entry);
  els.detailEmpty.classList.add('hidden');
  els.detailView.classList.remove('hidden');

  const poster = bundle.show?.image?.medium || 'https://placehold.co/400x600/11192f/eef4ff?text=TV';
  const status = bundle.show?.status || 'Unknown';
  const nextEpisodeText = bundle.nextEpisode ? formatNextEpisode(bundle.nextEpisode) : 'No date announced';
  const summary = stripHtml(bundle.show?.summary || 'No summary available.');
  const streaming = bundle.streaming || 'Unknown';
  const assignedText = assignedUsers.length ? assignedUsers.map((user) => user.name).join(', ') : (state.users.length ? 'Unassigned' : 'No users set up');

  els.detailView.innerHTML = `
    <section class="detail-hero">
      <div class="detail-poster"><img src="${escapeAttr(poster)}" alt="${escapeAttr(bundle.show?.name || '')} poster"></div>
      <div class="detail-summary">
        <div class="detail-summary__top">
          <h2>${escapeHtml(bundle.show?.name || '')}</h2>
          <div class="detail-summary__actions">
            <button id="detailAssignBtn" class="ghost-btn small">Assign users</button>
          </div>
        </div>
        <p>${escapeHtml(summary)}</p>
        <div class="detail-stat-grid">
          <div class="stat-card"><span class="label">Main channel</span><span class="value">${escapeHtml(bundle.mainChannel || 'Unknown')}</span></div>
          <div class="stat-card"><span class="label">Best-known service</span><span class="value">${escapeHtml(streaming)}</span></div>
          <div class="stat-card"><span class="label">Next scheduled episode</span><span class="value">${escapeHtml(nextEpisodeText)}</span></div>
          <div class="stat-card"><span class="label">Status</span><span class="value">${escapeHtml(status)}</span></div>
          <div class="stat-card"><span class="label">Assigned users</span><span class="value">${escapeHtml(assignedText)}</span></div>
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

  els.detailView.querySelector('#detailAssignBtn').addEventListener('click', () => openAssignModal(entry.id));
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

    const labels = ['Season', 'Episodes', 'Release', 'Description', 'Starring', 'Streaming', 'Next episode', 'Watched?'];
    [...row.children].forEach((cell, index) => cell.setAttribute('data-label', labels[index] || ''));

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(entry?.watched?.[seasonRow.season]);
    checkbox.addEventListener('change', async () => {
      const showEntry = state.shows.find((item) => item.id === bundle.id);
      if (!showEntry) return;
      showEntry.watched = showEntry.watched || {};
      showEntry.watched[seasonRow.season] = checkbox.checked;
      showEntry.updatedAt = new Date().toISOString();
      persistState();
      row.classList.toggle('watched-row', checkbox.checked);
      renderLineup();
      if (hasSupabaseConfig()) {
        try {
          await upsertRemoteShows([showEntry]);
          markSyncSuccess();
        } catch (err) {
          console.error(err);
          markSyncError(err);
          toast(`Saved locally, but cloud sync failed: ${friendlySyncError(err)}`);
        }
      }
    });
    row.querySelector('.season-watched').appendChild(checkbox);
    if (checkbox.checked) row.classList.add('watched-row');
    tbody.appendChild(row);
  });
}

function renderUpcoming() {}

function openThreeWeekSchedule() {
  state.upcomingFilter = '21';
  document.querySelectorAll('[data-lineup-filter]').forEach((chip) => chip.classList.toggle('active', chip.dataset.lineupFilter === '21'));
  persistState();
  render();
  activateMobilePane('lineup');
  const target = els.lineupGrid?.closest('.lineup-panel') || els.lineupGrid;
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportState() {
  const blob = new Blob([JSON.stringify({ settings: state.settings, users: state.users, shows: state.shows }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tv-lineup-export-${APP_VERSION}.json`;
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
    if (Array.isArray(payload?.users)) state.users = payload.users;
    if (Array.isArray(payload?.shows)) state.shows = payload.shows;
    normalizeState();
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

async function syncCloudState({ initial = false, manual = false } = {}) {
  if (!hasSupabaseConfig()) {
    state.sync = { mode: 'local', lastSyncAt: '', error: '' };
    persistState();
    renderSyncStatus();
    if (manual) toast('Add your Supabase details in Settings first.');
    return;
  }
  if (syncInFlight) {
    if (manual) toast('Sync already running. Give it a second, not a funeral.');
    return;
  }

  syncInFlight = true;
  state.sync.mode = 'syncing';
  state.sync.error = '';
  renderSyncStatus();

  try {
    await ensureRemoteWorkspace();
    const remote = await fetchRemoteSnapshot();
    const remoteHasData = remote.users.length > 0 || remote.shows.length > 0;
    const localHasData = state.users.length > 0 || state.shows.length > 0;

    if (!remoteHasData && localHasData) {
      await pushWholeLocalState();
      markSyncSuccess();
      if (manual || initial) toast('Cloud sync is live and your local lineup has been pushed up.');
    } else if (remoteHasData && localHasData) {
      const merged = mergeSnapshots({
        localUsers: state.users,
        remoteUsers: remote.users,
        localShows: state.shows,
        remoteShows: remote.shows,
      });
      state.users = merged.users;
      state.shows = merged.shows;
      if (!state.users.some((user) => user.id === state.activeUserFilter)) state.activeUserFilter = 'all';
      if (!state.shows.some((show) => show.id === state.selectedId)) state.selectedId = state.shows[0]?.id || null;
      state.cache = {};
      persistState();
      await pushWholeLocalState();
      if (merged.removedUserIds?.length) await deleteRemoteUsers(merged.removedUserIds);
      markSyncSuccess();
      render();
      if (manual || initial) toast('Supabase is live. Local and cloud data were merged.');
    } else {
      const dedupedRemoteUsers = dedupeUsers(remote.users.map((user, index) => normalizeUser(user, index)));
      state.users = dedupedRemoteUsers.users;
      state.shows = remote.shows.map((show) => remapShowUserIds(normalizeShow(show), dedupedRemoteUsers.idMap)).sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
      if (dedupedRemoteUsers.removedIds?.length) await deleteRemoteUsers(dedupedRemoteUsers.removedIds);
      if (!state.users.some((user) => user.id === state.activeUserFilter)) state.activeUserFilter = 'all';
      if (!state.shows.some((show) => show.id === state.selectedId)) state.selectedId = state.shows[0]?.id || null;
      state.cache = {};
      persistState();
      markSyncSuccess();
      render();
      if (manual && !initial) toast('Pulled the latest lineup from Supabase.');
    }
  } catch (err) {
    console.error(err);
    markSyncError(err);
    if (manual || initial) toast(`Supabase sync failed: ${friendlySyncError(err)}`);
  } finally {
    syncInFlight = false;
    renderSyncStatus();
  }
}

function hasSupabaseConfig() {
  return Boolean(state.settings.supabaseUrl && state.settings.supabaseKey && state.settings.workspaceSlug);
}

function renderSyncStatus() {
  if (!els.syncStatusPill) return;
  els.syncStatusPill.className = 'pill neutral';

  if (!hasSupabaseConfig()) {
    els.syncStatusPill.textContent = 'Local only';
    if (els.syncErrorDetail) { els.syncErrorDetail.textContent = ''; els.syncErrorDetail.classList.add('hidden'); }
    return;
  }
  if (state.sync.mode === 'syncing') {
    els.syncStatusPill.className = 'pill syncing';
    els.syncStatusPill.textContent = 'Syncing…';
    if (els.syncErrorDetail) { els.syncErrorDetail.textContent = ''; els.syncErrorDetail.classList.add('hidden'); }
    return;
  }
  if (state.sync.mode === 'error') {
    els.syncStatusPill.className = 'pill error';
    els.syncStatusPill.textContent = 'Sync error';
    if (els.syncErrorDetail) { els.syncErrorDetail.textContent = friendlySyncError({ message: state.sync.error || '' }); els.syncErrorDetail.classList.remove('hidden'); }
    return;
  }

  els.syncStatusPill.className = 'pill success';
  els.syncStatusPill.textContent = state.sync.lastSyncAt ? `Cloud sync · ${formatTimeOnly(state.sync.lastSyncAt)}` : 'Cloud sync ready';
  if (els.syncErrorDetail) { els.syncErrorDetail.textContent = ''; els.syncErrorDetail.classList.add('hidden'); }
}

function markSyncSuccess() {
  state.sync = { mode: 'synced', lastSyncAt: new Date().toISOString(), error: '' };
  persistState();
  renderSyncStatus();
}

function markSyncError(err) {
  state.sync = { mode: 'error', lastSyncAt: state.sync.lastSyncAt || '', error: err?.message || String(err) };
  persistState();
  renderSyncStatus();
}

function friendlySyncError(err) {
  const message = err?.message || String(err);
  if (/relation .* does not exist/i.test(message)) return 'Run the SQL in supabase-setup.sql first.';
  if (/JWT|apikey|Invalid API key/i.test(message)) return 'Check the project URL and Supabase browser key.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return 'Network request failed. On phones this usually means the URL/key is wrong, the site is blocked from reaching Supabase, or the browser cached old settings.';
  if (/abort|aborted|timeout/i.test(message)) return 'The sync request timed out. Try again on a stronger connection.';
  return message;
}

async function ensureRemoteWorkspace() {
  const body = [{ slug: state.settings.workspaceSlug, label: state.settings.workspaceSlug }];
  await supabaseRest('/tvt_workspaces?on_conflict=slug', {
    method: 'POST',
    body,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

async function fetchRemoteSnapshot() {
  const workspace = encodeFilterValue(state.settings.workspaceSlug);
  const [users, shows] = await Promise.all([
    supabaseRest(`/tvt_users?workspace_slug=eq.${workspace}&select=*&order=sort_order.asc,created_at.asc`),
    supabaseRest(`/tvt_shows?workspace_slug=eq.${workspace}&select=*&order=added_at.desc`),
  ]);
  return {
    users: Array.isArray(users) ? users : [],
    shows: Array.isArray(shows) ? shows : [],
  };
}

async function pushWholeLocalState() {
  if (state.users.length) await upsertRemoteUsers(state.users);
  if (state.shows.length) await upsertRemoteShows(state.shows);
}

async function upsertRemoteUsers(users) {
  if (!users.length) return [];
  return supabaseRest('/tvt_users?on_conflict=id', {
    method: 'POST',
    body: users.map(serializeUserForRemote),
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

async function upsertRemoteShows(shows) {
  if (!shows.length) return [];
  return supabaseRest('/tvt_shows?on_conflict=id', {
    method: 'POST',
    body: shows.map(serializeShowForRemote),
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

async function deleteRemoteUser(userId) {
  return supabaseRest(`/tvt_users?id=eq.${encodeFilterValue(userId)}`, { method: 'DELETE', prefer: 'return=representation' });
}

async function deleteRemoteUsers(userIds = []) {
  for (const userId of [...new Set(userIds)].filter(Boolean)) {
    await deleteRemoteUser(userId);
  }
}

async function deleteRemoteShow(showId) {
  return supabaseRest(`/tvt_shows?id=eq.${encodeFilterValue(showId)}`, { method: 'DELETE', prefer: 'return=representation' });
}

function serializeUserForRemote(user) {
  return {
    id: user.id,
    workspace_slug: state.settings.workspaceSlug,
    name: user.name,
    color: user.color,
    sort_order: user.sortOrder,
    created_at: user.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function mergeSnapshots({ localUsers = [], remoteUsers = [], localShows = [], remoteShows = [] } = {}) {
  const dedupedUsers = dedupeUsers([...remoteUsers, ...localUsers].map((raw, index) => normalizeUser(raw, index)));
  const users = dedupedUsers.users;
  const validUserIds = new Set(users.map((user) => user.id));
  const showMap = new Map();

  [...remoteShows, ...localShows].forEach((raw) => {
    const show = remapShowUserIds(normalizeShow(raw), dedupedUsers.idMap);
    show.assignedUserIds = normalizeAssignedUserIds(show.assignedUserIds).filter((id) => validUserIds.has(id));
    const key = getShowMergeKey(show);
    const existing = showMap.get(key);
    if (!existing) {
      showMap.set(key, show);
      return;
    }

    const preferred = isNewerRecord(show, existing) ? show : existing;
    const mergedAssigned = [...new Set([...(existing.assignedUserIds || []), ...(show.assignedUserIds || [])])].filter((id) => validUserIds.has(id));
    const mergedWatched = { ...(existing.watched || {}), ...(show.watched || {}) };
    showMap.set(key, { ...preferred, assignedUserIds: mergedAssigned, watched: mergedWatched });
  });

  const shows = [...showMap.values()].sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
  return { users, shows, removedUserIds: dedupedUsers.removedIds };
}

function getShowMergeKey(show) {
  if (show.tmdbId) return `tmdb:${show.tmdbId}`;
  if (show.tvmazeId) return `tvmaze:${show.tvmazeId}`;
  const year = String(show.premiered || '').slice(0, 4);
  return `${normalizeTitle(show.name)}|${year}`;
}

function isNewerRecord(a, b) {
  const aTime = Date.parse(a?.updatedAt || a?.updated_at || a?.createdAt || a?.created_at || 0) || 0;
  const bTime = Date.parse(b?.updatedAt || b?.updated_at || b?.createdAt || b?.created_at || 0) || 0;
  if (aTime === bTime) return String(a?.addedAt || a?.added_at || '') > String(b?.addedAt || b?.added_at || '');
  return aTime > bTime;
}

function serializeShowForRemote(show) {
  return {
    id: show.id,
    workspace_slug: state.settings.workspaceSlug,
    source: show.source,
    tmdb_id: show.tmdbId ?? null,
    tvmaze_id: show.tvmazeId ?? null,
    name: show.name,
    premiered: show.premiered || '',
    watched: show.watched || {},
    assigned_user_ids: normalizeAssignedUserIds(show.assignedUserIds),
    added_at: show.addedAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function supabaseRest(path, { method = 'GET', body, prefer = '', headers = {} } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS + 3000);
  try {
    const response = await fetch(`${state.settings.supabaseUrl}/rest/v1${path}`, {
      method,
      signal: controller.signal,
      headers: {
        apikey: state.settings.supabaseKey,
        Authorization: `Bearer ${state.settings.supabaseKey}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
        ...headers,
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data = text ? safeJsonParse(text) : null;
    if (!response.ok) {
      const message = data?.message || data?.error_description || data?.hint || text || `Supabase request failed: ${response.status}`;
      throw new Error(message);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

function normalizeSupabaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(db\.)/i.test(trimmed)) return '';
  return `https://${trimmed}`;
}

function normalizeApiKey(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function normalizeWorkspaceSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function encodeFilterValue(value) {
  return encodeURIComponent(String(value)).replace(/\./g, '%2E');
}

function nextUserColor() {
  return USER_COLORS[state.users.length % USER_COLORS.length];
}

function makeId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
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
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]*>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function formatDateTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatTimeOnly(value) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function toast(message) {
  console.log(message);
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 5000);
}

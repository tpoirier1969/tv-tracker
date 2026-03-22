window.TV_TRACKER_CONFIG = {
  tmdbApiKey: '',
  watchRegion: 'US',
  castCount: 4,
  supabaseUrl: 'https://YOURPROJECT.supabase.co',
  supabaseKey: 'YOUR_PUBLISHABLE_KEY',
  workspaceSlug: 'cabin-tv-household'
};


window.buildRuntimeConfigSource = function buildRuntimeConfigSource() {
  return `window.TV_TRACKER_CONFIG = ${JSON.stringify(window.TV_TRACKER_CONFIG || {}, null, 2)};`;
};

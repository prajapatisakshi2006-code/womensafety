// SafeRoute Supabase & Cloud Backend Configuration
// Project credentials: Supabase Dashboard -> Project Settings -> API
(function () {
  // Original / Default Supabase Project credentials
  const DEFAULT_SUPABASE_URL = 'https://bwimgoeyequnwinqrwqr.supabase.co';
  const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3aW1nb2V5ZXF1bndpbnFyd3FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyODkwNjgsImV4cCI6MjEwNjg2NTA2OH0.gvBE7GwU22tPPtjmr40l0w1ashf9uUJaEfxZf_TwV8g';

  // Check for custom Supabase credentials saved in localStorage
  let activeUrl = (localStorage.getItem('saferoute_custom_sb_url') || '').trim();
  let activeKey = (localStorage.getItem('saferoute_custom_sb_key') || '').trim();

  // If no custom credentials, fall back to default
  if (!activeUrl || !activeKey) {
    activeUrl = DEFAULT_SUPABASE_URL;
    activeKey = DEFAULT_SUPABASE_ANON_KEY;
  }

  // Global Config Object
  window.SUPABASE_CONFIG = {
    url: activeUrl,
    anonKey: activeKey,
    defaultUrl: DEFAULT_SUPABASE_URL,
    defaultAnonKey: DEFAULT_SUPABASE_ANON_KEY,
    isCustom: activeUrl !== DEFAULT_SUPABASE_URL,
    saveCredentials(newUrl, newKey) {
      if (newUrl && newKey) {
        localStorage.setItem('saferoute_custom_sb_url', newUrl.trim());
        localStorage.setItem('saferoute_custom_sb_key', newKey.trim());
      } else {
        localStorage.removeItem('saferoute_custom_sb_url');
        localStorage.removeItem('saferoute_custom_sb_key');
      }
      location.reload();
    },
    resetToDefault() {
      localStorage.removeItem('saferoute_custom_sb_url');
      localStorage.removeItem('saferoute_custom_sb_key');
      location.reload();
    }
  };

  // Initialize Supabase client
  if (window.supabase && activeUrl && activeKey) {
    try {
      window.sb = window.supabase.createClient(activeUrl, activeKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      });
      console.log('✅ [SafeRoute] Supabase Client Initialized:', activeUrl);
    } catch (e) {
      console.warn('⚠️ [SafeRoute] Supabase createClient error:', e);
      window.sb = null;
    }
  } else {
    window.sb = null;
  }
})();

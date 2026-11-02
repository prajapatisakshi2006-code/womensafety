// SafeRoute Backend & Cloud Configuration
// To connect your own Supabase project, enter your URL and anon key in the App Settings.
(function () {
  const customUrl = localStorage.getItem('saferoute_custom_sb_url');
  const customKey = localStorage.getItem('saferoute_custom_sb_key');

  if (customUrl && customKey && window.supabase) {
    try {
      window.sb = window.supabase.createClient(customUrl, customKey);
      console.log('✅ [SafeRoute] Custom Supabase client active:', customUrl);
    } catch (e) {
      console.warn('Custom Supabase connection error:', e);
      window.sb = null;
    }
  } else {
    // Cloud client is inactive until an active Supabase project is configured.
    // SafeRoute operates smoothly on its built-in Local Safety & Offline Engine.
    window.sb = null;
  }
})();

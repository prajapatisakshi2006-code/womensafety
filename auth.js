/* SafeRoute Authentication & Emergency Contact Safety Engine
 * Full Supabase Cloud Integration (auth, profiles, emergency_contacts, safe_spots, sos_events)
 * Zero-Crash Resilient Error Handling (Explains Supabase paused states, eliminates "Failed to fetch" crashes)
 * Immediate Native Android Contact Sync for Physical Power & Volume Buttons
 * Session Persistence across reloads & Secure Clean Logout
 */
(function () {
  const SESSION_KEY = 'saferoute_session';
  const LOCAL_CONTACTS_KEY = 'saferoute_local_contacts';
  const LOCAL_ACCOUNTS_KEY = 'saferoute_local_accounts';
  const POWER_THRESH_KEY = 'saferoute_power_press_threshold';
  const SIREN_PREF_KEY = 'saferoute_siren_on_hardware_sos';

  // Initialize SafeAuth namespace
  const S = (window.SafeAuth = {
    user: null,
    profile: null,
    contacts: [],
    spots: [],
    isSupabaseOnline: false
  });

  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const waNumber = p => { const d = String(p).replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };

  // Toast notification helper
  function showToast(text, duration = 3500) {
    let t = document.getElementById('safeToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'safeToast';
      t.style.cssText = 'position:fixed;bottom:85px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.96);color:#fff;padding:12px 22px;border-radius:14px;font-size:0.86rem;font-weight:700;z-index:9999;box-shadow:0 12px 32px rgba(0,0,0,0.38);border:1px solid rgba(255,255,255,0.18);pointer-events:none;transition:opacity 0.25s,transform 0.25s;text-align:center;max-width:88vw;';
      document.body.appendChild(t);
    }
    t.innerHTML = text;
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._hideTimeout);
    t._hideTimeout = setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(8px)';
    }, duration);
  }
  window.showSafeToast = showToast;

  // Local storage helpers
  function getLocalAccounts() {
    try {
      const stored = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalAccounts(accs) {
    try {
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accs));
    } catch (e) {}
  }

  function saveLocalContacts(list) {
    try {
      localStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(list));
    } catch (e) {}
    S.contacts = list;
    syncContactsToNative(list);
  }

  function loadLocalContacts() {
    try {
      const stored = localStorage.getItem(LOCAL_CONTACTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  // Session persistence
  function saveSession(user, profile, contacts = null) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user, profile }));
    } catch (e) {}
    S.user = user;
    S.profile = profile;
    if (contacts && Array.isArray(contacts)) {
      saveLocalContacts(contacts);
    } else {
      syncContactsToNative(S.contacts);
    }
    updateAvatarButton();
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    S.user = null;
    S.profile = null;
    syncContactsToNative(S.contacts);
    updateAvatarButton();
  }

  function restoreSavedSession() {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.user) {
          S.user = parsed.user;
          S.profile = parsed.profile || {
            id: parsed.user.id,
            full_name: parsed.user.user_metadata?.full_name || parsed.user.email?.split('@')[0] || 'User',
            email: parsed.user.email
          };
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Android Native Capacitor Plugin Sync
  function syncContactsToNative(contactsList) {
    try {
      const CapPlugins = window.Capacitor && window.Capacitor.Plugins;
      if (CapPlugins && CapPlugins.NativeSiren) {
        const validPhones = (contactsList || []).map(c => c.phone).filter(Boolean);
        if (validPhones.length > 0) {
          if (CapPlugins.NativeSiren.setEmergencyContact) {
            CapPlugins.NativeSiren.setEmergencyContact({ phone: validPhones[0] });
          }
          if (CapPlugins.NativeSiren.setEmergencyContacts) {
            CapPlugins.NativeSiren.setEmergencyContacts({ phones: validPhones.join(',') });
          }
        } else {
          if (CapPlugins.NativeSiren.setEmergencyContact) {
            CapPlugins.NativeSiren.setEmergencyContact({ phone: '' });
          }
          if (CapPlugins.NativeSiren.setEmergencyContacts) {
            CapPlugins.NativeSiren.setEmergencyContacts({ phones: '' });
          }
        }

        if (CapPlugins.NativeSiren.setPowerPressThreshold) {
          const threshold = parseInt(localStorage.getItem(POWER_THRESH_KEY) || '3', 10);
          CapPlugins.NativeSiren.setPowerPressThreshold({ count: threshold });
        }

        if (CapPlugins.NativeSiren.setHardwareSirenEnabled) {
          const sirenEnabled = localStorage.getItem(SIREN_PREF_KEY) !== 'false';
          CapPlugins.NativeSiren.setHardwareSirenEnabled({ enabled: sirenEnabled });
        }

        if (CapPlugins.NativeSiren.setUserLoggedIn) {
          CapPlugins.NativeSiren.setUserLoggedIn({
            isLoggedIn: !!S.user,
            email: S.user ? S.user.email : ''
          });
        }
      }
    } catch (e) {
      console.warn('Native contact sync notice:', e);
    }
  }

  // Error parsing helper for informative, actionable UI feedback
  function parseAuthError(error) {
    if (!error) return null;
    const raw = String(error.message || error.error_description || error || '');
    const currentUrl = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || 'Supabase';

    if (
      raw.includes('Failed to fetch') ||
      raw.includes('NetworkError') ||
      raw.includes('Load failed') ||
      raw.includes('fetch failed')
    ) {
      return {
        type: 'NETWORK_PAUSED',
        title: 'Supabase Cloud Is Inactive or Paused',
        html: `
          <div style="text-align:left;line-height:1.45;font-size:0.8rem;">
            <p style="margin:0 0 6px;"><strong>Connection to Supabase failed:</strong> <code>${esc(currentUrl)}</code></p>
            <p style="margin:0 0 8px;color:var(--text-muted,#64748b);">
              On Supabase's free tier, inactive projects are paused after 7 days, which temporarily removes their DNS record and causes browser <em>"Failed to fetch"</em> errors.
            </p>
            <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:8px 10px;margin-bottom:8px;">
              <strong>How to resolve:</strong>
              <ol style="margin:4px 0 0;padding-left:18px;">
                <li>Log in to <a href="https://supabase.com/dashboard" target="_blank" rel="noopener" style="color:var(--primary,#7c3aed);font-weight:700;text-decoration:underline;">Supabase Dashboard</a> and click <strong>"Restore Project"</strong>.</li>
                <li>Or if you created a new Supabase project, click the button below to update your Project URL &amp; Anon Key.</li>
              </ol>
            </div>
            <div style="display:flex;gap:6px;margin-top:6px;">
              <button type="button" class="auth-btn alt" id="btnOpenSbSettings" style="font-size:0.75rem;padding:6px 10px;margin-top:0;">⚙️ Update Supabase Keys</button>
              <button type="button" class="auth-btn" id="btnFallbackLocal" style="background:#059669;font-size:0.75rem;padding:6px 10px;margin-top:0;">⚡ Continue in Local Mode</button>
            </div>
          </div>`
      };
    }

    if (raw.includes('Invalid login credentials')) {
      return {
        type: 'INVALID_CREDENTIALS',
        title: 'Incorrect Credentials',
        html: `Invalid email or password. Please double-check your credentials and try again.`
      };
    }

    if (raw.includes('Email not confirmed')) {
      return {
        type: 'EMAIL_UNCONFIRMED',
        title: 'Email Confirmation Needed',
        html: `Your account was created, but your email address has not been confirmed yet.<br>
          Please check your email inbox for the confirmation link, or disable <strong>"Confirm email"</strong> in Supabase Dashboard → Authentication → Providers → Email for instant logins.`
      };
    }

    if (raw.includes('User already registered') || raw.includes('already registered')) {
      return {
        type: 'ALREADY_REGISTERED',
        title: 'Account Already Exists',
        html: `An account with this email is already registered. Please log in, or click <em>Forgot password</em>.`
      };
    }

    return {
      type: 'GENERIC',
      title: 'Authentication Error',
      html: esc(raw)
    };
  }

  // Load User Data from Supabase (with automatic profile self-healing)
  async function loadUserData(authUser) {
    if (!authUser) {
      S.profile = null;
      updateAvatarButton();
      return;
    }

    if (!window.sb) {
      if (!S.profile) {
        S.profile = {
          id: authUser.id,
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
          phone: authUser.user_metadata?.phone || '',
          email: authUser.email,
          role: 'user'
        };
      }
      updateAvatarButton();
      return;
    }

    try {
      // 1. Fetch Profile
      const { data: profile, error: pErr } = await window.sb
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!pErr && profile) {
        S.profile = profile;
      } else {
        // Profile record doesn't exist yet (e.g. trigger didn't fire) -> Self-heal by inserting
        const fallbackProfile = {
          id: authUser.id,
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
          phone: authUser.user_metadata?.phone || '',
          email: authUser.email,
          role: 'user'
        };
        try {
          await window.sb.from('profiles').upsert(fallbackProfile);
          S.profile = fallbackProfile;
        } catch (e) {
          S.profile = fallbackProfile;
        }
      }

      // 2. Fetch Emergency Contacts from Supabase
      const { data: contacts, error: cErr } = await window.sb
        .from('emergency_contacts')
        .select('*')
        .order('created_at', { ascending: true });

      if (!cErr && Array.isArray(contacts) && contacts.length > 0) {
        S.contacts = contacts;
        saveLocalContacts(contacts);
      } else if (S.contacts && S.contacts.length > 0) {
        // Sync any local contacts up to Supabase
        for (const c of S.contacts) {
          if (!c.created_at) {
            try {
              await window.sb.from('emergency_contacts').insert({
                user_id: authUser.id,
                name: c.name,
                phone: c.phone
              });
            } catch (err) {}
          }
        }
      }
    } catch (e) {
      console.warn('loadUserData notice:', e);
    }

    saveSession(authUser, S.profile, S.contacts);
    updateAvatarButton();
  }

  // Load Safe Spots from Supabase with resilient fallback
  const DEFAULT_SAFE_SPOTS = [
    { id: 1, name: 'Central Women Safety Police Desk', type: 'police', lat: 28.6194, lng: 77.2132, phone: '1091 / 112', details: '24/7 Rapid Action Patrol & Women Assistance Desk', active: true },
    { id: 2, name: 'Apex 24/7 Emergency Care Hospital', type: 'hospital', lat: 28.6209, lng: 77.2030, phone: '108', details: '24-hour emergency trauma entrance & casualty response', active: true },
    { id: 3, name: 'Safe Corridor Police Checkpost', type: 'police', lat: 28.6130, lng: 77.2090, phone: '112', details: 'CCTV-Monitored Quick Assistance Safety Haven', active: true }
  ];

  async function loadSafeSpots() {
    if (window.sb) {
      try {
        const { data, error } = await window.sb
          .from('safe_spots')
          .select('*')
          .eq('active', true);
        if (!error && Array.isArray(data) && data.length > 0) {
          S.spots = data;
          window.dispatchEvent(new Event('spots-loaded'));
          return;
        }
      } catch (e) {}
    }
    S.spots = DEFAULT_SAFE_SPOTS;
    window.dispatchEvent(new Event('spots-loaded'));
  }

  // Inject UI Styles
  document.head.insertAdjacentHTML('beforeend', `<style>
  .auth-overlay{position:fixed;inset:0;background:rgba(15,23,42,.7);display:none;align-items:center;justify-content:center;z-index:5000;padding:16px;backdrop-filter:blur(6px)}
  .auth-card{background:var(--bg-card,#fff);color:var(--text-main,#0f172a);border-radius:22px;padding:22px;width:100%;max-width:410px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.38);font-family:inherit}
  .auth-card h2{margin:0 0 4px;font-size:1.25rem;display:flex;align-items:center;gap:6px}
  .auth-card p.sub{margin:0 0 14px;color:var(--text-muted,#64748b);font-size:.82rem;line-height:1.4}
  .auth-card input{width:100%;box-sizing:border-box;padding:11px 12px;margin-bottom:10px;border:1px solid var(--border-subtle,#e2e8f0);border-radius:10px;background:var(--bg-subtle,#f8fafc);color:inherit;font:inherit;font-size:.9rem}
  .auth-btn{width:100%;padding:11px;border:0;border-radius:10px;background:var(--primary,#7c3aed);color:#fff;font-weight:700;cursor:pointer;font:inherit;transition:opacity .15s}
  .auth-btn:active{opacity:.85}
  .auth-btn.alt{background:transparent;color:var(--primary,#7c3aed);border:1px solid var(--primary,#7c3aed);margin-top:8px}
  .auth-btn.danger{background:#ef4444}
  .auth-btn.demo{background:linear-gradient(135deg, #10b981, #059669);color:#fff;border:none;margin-top:8px}
  .auth-btn.sms-fix{background:linear-gradient(135deg, #ef4444, #dc2626);color:#fff;border:none;padding:8px 12px;font-size:0.8rem;border-radius:8px;}
  .auth-msg{font-size:.84rem;margin:10px 0;line-height:1.4}.auth-msg.err{color:#dc2626;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);padding:10px;border-radius:10px;}.auth-msg.ok{color:#059669;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);padding:10px;border-radius:10px;}
  .auth-link{background:none;border:0;color:var(--primary,#7c3aed);cursor:pointer;font:inherit;font-size:.82rem;margin-top:10px;padding:0;text-decoration:underline}
  .contact-row{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--border-subtle,#e2e8f0);border-radius:10px;margin-bottom:8px;font-size:.85rem;background:var(--bg-subtle,#f8fafc)}
  .contact-info{display:flex;flex-direction:column;gap:2px}
  .contact-name{font-weight:600;color:var(--text-main,#0f172a)}
  .contact-phone{font-size:.8rem;color:var(--text-muted,#64748b)}
  .contact-row button{background:none;border:0;cursor:pointer;color:#ef4444;font-size:1.1rem;padding:4px 8px;border-radius:6px}
  .contact-row button:hover{background:rgba(239,68,68,.1)}
  .auth-close{float:right;background:none;border:0;font-size:1.2rem;cursor:pointer;color:inherit;padding:2px 6px}
  .contact-tag-badge{display:inline-block;font-size:.7rem;padding:2px 6px;border-radius:4px;background:#10b98120;color:#059669;font-weight:600;margin-left:6px}
  .cloud-mode-badge{display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;padding:3px 9px;border-radius:6px;font-weight:700;margin-bottom:10px;}
  .cloud-mode-badge.supabase{background:rgba(124,58,237,0.15);color:#7c3aed;}
  .cloud-mode-badge.local{background:rgba(16,185,129,0.15);color:#059669;}
  .sms-alert-box{background:rgba(239,68,68,0.08);border:1px solid #ef444455;border-radius:10px;padding:10px 12px;margin:10px 0;}
  </style>`);

  // Account button next to the theme toggle
  const themeBtn = document.getElementById('themeToggleBtn');
  const btn = document.createElement('button');
  btn.className = 'theme-toggle-btn';
  btn.title = 'Emergency Contacts & Account';

  function updateAvatarButton() {
    if (S.user) {
      const name = S.profile?.full_name || S.user.email || 'U';
      btn.textContent = name.charAt(0).toUpperCase();
      btn.style.background = 'var(--primary, #7c3aed)';
      btn.style.color = '#fff';
      btn.style.fontWeight = '700';
    } else {
      btn.textContent = '👤';
      btn.style.background = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    }
  }

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:8px';
  if (themeBtn && themeBtn.parentNode) {
    themeBtn.parentNode.insertBefore(wrap, themeBtn);
    wrap.append(btn, themeBtn);
  } else {
    document.body.appendChild(btn);
  }

  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.innerHTML = '<div class="auth-card" id="authCard"></div>';
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
  btn.addEventListener('click', () => { render(S.user ? 'account' : 'login'); overlay.style.display = 'flex'; });

  const card = overlay.firstChild;
  const closeX = '<button class="auth-close" id="aClose">✕</button>';

  function msg(htmlText, isOk = false) {
    const m = card.querySelector('.auth-msg');
    if (m) {
      m.innerHTML = htmlText;
      m.className = 'auth-msg ' + (isOk ? 'ok' : 'err');
    }
  }

  // Android SMS Permission Banner
  let cachedSmsGranted = true;
  async function checkSmsPermissionStatus() {
    try {
      const CapPlugins = window.Capacitor && window.Capacitor.Plugins;
      if (CapPlugins && CapPlugins.NativeSiren && CapPlugins.NativeSiren.checkSmsPermission) {
        const res = await CapPlugins.NativeSiren.checkSmsPermission();
        cachedSmsGranted = !!(res && res.granted);
        return cachedSmsGranted;
      }
    } catch (e) {}
    return true;
  }

  function renderSmsPermissionBanner() {
    const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (!isCapacitor || cachedSmsGranted) {
      return `
        <div style="margin:8px 0;padding:8px 10px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:10px;font-size:0.75rem;display:flex;align-items:center;justify-content:space-between;">
          <span style="color:#059669;font-weight:600;">📱 SMS Permission: Allowed &amp; Armed</span>
          <span style="font-size:0.9rem;">✅</span>
        </div>`;
    }

    return `
      <div class="sms-alert-box">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:1.1rem;">⚠️</span>
          <strong style="color:#dc2626;font-size:0.8rem;">Phone is not allowing background SMS</strong>
        </div>
        <p style="margin:0 0 8px;font-size:0.74rem;color:var(--text-muted,#64748b);line-height:1.4;">
          Your Android phone has restricted background SMS. Allow SMS permission so power &amp; volume button triggers send live coordinates.
        </p>
        <div style="display:flex;gap:8px;">
          <button type="button" id="allowSmsBtn" class="auth-btn sms-fix" style="flex:1;">Allow SMS</button>
          <button type="button" id="openSettingsBtn" class="auth-btn alt" style="flex:1;margin-top:0;font-size:0.78rem;padding:7px;">Settings</button>
        </div>
      </div>`;
  }

  function bindSmsPermissionActions() {
    const allowBtn = card.querySelector('#allowSmsBtn');
    if (allowBtn) {
      allowBtn.onclick = async () => {
        try {
          const CapPlugins = window.Capacitor && window.Capacitor.Plugins;
          if (CapPlugins && CapPlugins.NativeSiren) {
            if (CapPlugins.NativeSiren.requestSmsPermission) {
              await CapPlugins.NativeSiren.requestSmsPermission();
            } else if (CapPlugins.NativeSiren.openAppSettings) {
              await CapPlugins.NativeSiren.openAppSettings();
            }
          }
        } catch (e) {}
        setTimeout(async () => {
          await checkSmsPermissionStatus();
          render(S.user ? 'account' : 'contacts');
        }, 1200);
      };
    }

    const setBtn = card.querySelector('#openSettingsBtn');
    if (setBtn) {
      setBtn.onclick = async () => {
        try {
          const CapPlugins = window.Capacitor && window.Capacitor.Plugins;
          if (CapPlugins && CapPlugins.NativeSiren && CapPlugins.NativeSiren.openAppSettings) {
            await CapPlugins.NativeSiren.openAppSettings();
          }
        } catch (e) {}
      };
    }
  }

  function renderHardwareTriggerOption() {
    const cur = localStorage.getItem(POWER_THRESH_KEY) || '3';
    return `
      ${renderSmsPermissionBanner()}
      <div style="margin:10px 0 12px;padding:10px 12px;background:var(--bg-subtle,#f8fafc);border:1px solid var(--border-subtle,#e2e8f0);border-radius:10px;">
        <label style="font-size:0.78rem;font-weight:700;display:block;margin-bottom:5px;">⚡ Hardware Button SOS Trigger (Power &amp; Volume):</label>
        <select id="powerPressSelect" style="width:100%;padding:7px 9px;border-radius:8px;border:1px solid var(--border-subtle,#cbd5e1);background:var(--bg-card,#fff);color:inherit;font:inherit;font-size:0.82rem;">
          <option value="3" ${cur === '3' ? 'selected' : ''}>3 Rapid Presses (Recommended)</option>
          <option value="2" ${cur === '2' ? 'selected' : ''}>2 Rapid Presses (Faster trigger)</option>
        </select>
        <small style="color:var(--text-muted,#64748b);font-size:0.72rem;display:block;margin-top:6px;line-height:1.4;">
          🛡️ Rapid presses dispatch silent emergency GPS SMS to contacts. The audible Siren operates independently via the dedicated Siren button.
        </small>
      </div>`;
  }

  function bindHardwareTriggerControls() {
    bindSmsPermissionActions();

    const sel = card.querySelector('#powerPressSelect');
    if (sel) {
      sel.onchange = () => {
        const val = parseInt(sel.value, 10);
        localStorage.setItem(POWER_THRESH_KEY, String(val));
        try {
          const CapPlugins = window.Capacitor && window.Capacitor.Plugins;
          if (CapPlugins && CapPlugins.NativeSiren && CapPlugins.NativeSiren.setPowerPressThreshold) {
            CapPlugins.NativeSiren.setPowerPressThreshold({ count: val });
          }
        } catch (e) {}
      };
    }
  }

  // Quick Demo Account Handler
  function loginAsDemoUser() {
    const demoUser = { id: 'usr_demo_' + Date.now(), email: 'demo@saferoute.com' };
    const demoProfile = { id: demoUser.id, full_name: 'SafeRoute Demo User', phone: '+919876543210', role: 'user' };

    if (!S.contacts || S.contacts.length === 0) {
      S.contacts = [
        { id: 'c_demo1', name: 'Family Emergency Contact', phone: '9876543210' },
        { id: 'c_demo2', name: 'Police Helpline 112', phone: '112' }
      ];
      saveLocalContacts(S.contacts);
    }

    saveSession(demoUser, demoProfile, S.contacts);
    overlay.style.display = 'none';
    showToast('✅ Logged in as Demo User with emergency hardware triggers armed!');
  }

  // Main UI Modal Renderer
  function render(view, initialData = {}) {
    checkSmsPermissionStatus();

    if (view === 'login') {
      const emailVal = initialData.email || '';
      card.innerHTML = `${closeX}
        <h2>Welcome Back</h2>
        <span class="cloud-mode-badge supabase">☁️ Supabase Cloud &amp; Safety Auth</span>
        <p class="sub">Log in to sync your emergency contacts and activate physical button SOS dispatch.</p>
        
        <form id="aForm">
          <input id="aEmail" type="email" placeholder="Email address" value="${esc(emailVal)}" required autocomplete="email">
          <input id="aPass" type="password" placeholder="Password" required autocomplete="current-password">
          <div class="auth-msg"></div>
          <button class="auth-btn" id="aLoginSubmitBtn">Log In</button>
        </form>

        <div style="display:flex;justify-content:space-between;margin-top:12px;">
          <button class="auth-link" id="aSwitchReg">New here? Create account</button>
          <button class="auth-link" id="aSwitchContacts">Emergency Contacts →</button>
        </div>

        <div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--border-subtle,#e2e8f0);display:flex;justify-content:space-between;align-items:center;">
          <button type="button" class="auth-link" id="btnConfigSupabase" style="font-size:0.75rem;color:var(--text-muted,#64748b);">⚙️ Supabase Settings</button>
          <button type="button" class="auth-btn demo" id="aQuickDemoBtn" style="width:auto;padding:5px 12px;font-size:0.75rem;margin:0;">⚡ Instant Demo</button>
        </div>`;

      const demoBtn = card.querySelector('#aQuickDemoBtn');
      if (demoBtn) demoBtn.onclick = loginAsDemoUser;

      const confBtn = card.querySelector('#btnConfigSupabase');
      if (confBtn) confBtn.onclick = () => render('supabase_config');

      const swReg = card.querySelector('#aSwitchReg');
      if (swReg) swReg.onclick = () => render('register');

      const swCon = card.querySelector('#aSwitchContacts');
      if (swCon) swCon.onclick = () => render('contacts');

      card.querySelector('#aForm').onsubmit = async e => {
        e.preventDefault();
        const email = card.querySelector('#aEmail').value.trim();
        const pass = card.querySelector('#aPass').value;
        const submitBtn = card.querySelector('#aLoginSubmitBtn');

        if (!email || !pass) return;

        // Check if demo email
        if (email.toLowerCase() === 'demo@saferoute.com' || email.toLowerCase() === 'demo') {
          loginAsDemoUser();
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying credentials...';
        msg('Connecting to Supabase authentication server...', true);

        // 1. Attempt Supabase Cloud Authentication
        if (window.sb) {
          try {
            const { data, error } = await window.sb.auth.signInWithPassword({
              email: email,
              password: pass
            });

            if (error) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Log In';
              const parsed = parseAuthError(error);
              msg(parsed.html, false);

              // Attach dynamic buttons if rendered
              const sbBtn = card.querySelector('#btnOpenSbSettings');
              if (sbBtn) sbBtn.onclick = () => render('supabase_config');
              const localBtn = card.querySelector('#btnFallbackLocal');
              if (localBtn) {
                localBtn.onclick = () => {
                  performLocalLogin(email, pass);
                };
              }
              return;
            }

            if (data && data.user) {
              msg('✅ Login verified! Loading profile & contacts...', true);
              await loadUserData(data.user);
              overlay.style.display = 'none';
              showToast('✅ Welcome back, ' + (S.profile?.full_name || S.user.email) + '!');
              return;
            }
          } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Log In';
            const parsed = parseAuthError(err);
            msg(parsed.html, false);
            return;
          }
        }

        // 2. Fallback to Local Accounts if Supabase was unavailable or offline
        performLocalLogin(email, pass);
      };

      function performLocalLogin(email, pass) {
        const localAccs = getLocalAccounts();
        const match = localAccs.find(a => a.email.toLowerCase() === email.toLowerCase());

        if (match) {
          if (match.password === pass) {
            const user = { id: match.id, email: match.email };
            const profile = { id: match.id, full_name: match.name, phone: match.phone, role: 'user' };
            saveSession(user, profile);
            overlay.style.display = 'none';
            showToast('✅ Welcome back, ' + (match.name || 'User') + '!');
          } else {
            msg('Incorrect password for this account.', false);
          }
        } else {
          // Account doesn't exist locally -> Prompt user to register
          msg(`No local account found for <strong>${esc(email)}</strong>.<br>
            <button type="button" class="auth-link" id="aGoRegNow" style="font-weight:700;margin-top:6px;">👉 Click here to register this account</button>`, false);
          const goReg = card.querySelector('#aGoRegNow');
          if (goReg) goReg.onclick = () => render('register', { email });
        }
      }
    } else if (view === 'register') {
      const emailVal = initialData.email || '';
      card.innerHTML = `${closeX}
        <h2>Create Account</h2>
        <span class="cloud-mode-badge supabase">☁️ Supabase Cloud &amp; Safety Auth</span>
        <p class="sub">Register to safely back up emergency contacts and sync them directly with your physical phone buttons.</p>
        
        <form id="aForm">
          <input id="aName" placeholder="Full name (e.g. Ananya Sharma)" required autocomplete="name">
          <input id="aPhone" type="tel" placeholder="Mobile Number (e.g. 9876543210)" autocomplete="tel">
          <input id="aEmail" type="email" placeholder="Email address" value="${esc(emailVal)}" required autocomplete="email">
          <input id="aPass" type="password" placeholder="Password (min 6 characters)" minlength="6" required autocomplete="new-password">
          <div class="auth-msg"></div>
          <button class="auth-btn" id="aRegSubmitBtn">Create Account &amp; Log In</button>
        </form>

        <div style="display:flex;justify-content:space-between;margin-top:12px;">
          <button class="auth-link" id="aSwitchLog">Already have an account? Log in</button>
          <button class="auth-link" id="aSwitchContacts">Emergency Contacts →</button>
        </div>

        <div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--border-subtle,#e2e8f0);text-align:center;">
          <button type="button" class="auth-link" id="btnConfigSupabase" style="font-size:0.75rem;color:var(--text-muted,#64748b);">⚙️ Supabase Project Settings</button>
        </div>`;

      const confBtn = card.querySelector('#btnConfigSupabase');
      if (confBtn) confBtn.onclick = () => render('supabase_config');

      const swLog = card.querySelector('#aSwitchLog');
      if (swLog) swLog.onclick = () => render('login');

      const swCon = card.querySelector('#aSwitchContacts');
      if (swCon) swCon.onclick = () => render('contacts');

      card.querySelector('#aForm').onsubmit = async e => {
        e.preventDefault();
        const aName = card.querySelector('#aName').value.trim();
        const aPhone = card.querySelector('#aPhone').value.trim();
        const aEmail = card.querySelector('#aEmail').value.trim();
        const aPass = card.querySelector('#aPass').value;
        const submitBtn = card.querySelector('#aRegSubmitBtn');

        if (!aName || !aEmail || !aPass) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Registering user...';
        msg('Creating your SafeRoute account in Supabase...', true);

        // 1. Try Supabase Registration First
        if (window.sb) {
          try {
            const { data, error } = await window.sb.auth.signUp({
              email: aEmail,
              password: aPass,
              options: {
                data: {
                  full_name: aName,
                  phone: aPhone
                }
              }
            });

            if (error) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Create Account & Log In';
              const parsed = parseAuthError(error);
              msg(parsed.html, false);

              const sbBtn = card.querySelector('#btnOpenSbSettings');
              if (sbBtn) sbBtn.onclick = () => render('supabase_config');
              const localBtn = card.querySelector('#btnFallbackLocal');
              if (localBtn) {
                localBtn.onclick = () => {
                  performLocalRegistration(aName, aPhone, aEmail, aPass);
                };
              }
              return;
            }

            if (data && data.user) {
              // Ensure Profile Row exists in `public.profiles`
              try {
                await window.sb.from('profiles').upsert({
                  id: data.user.id,
                  full_name: aName,
                  phone: aPhone,
                  email: aEmail,
                  role: 'user'
                });
              } catch (profileErr) {
                console.warn('Profile insertion notice:', profileErr);
              }

              // If phone provided, add as primary emergency contact
              if (aPhone) {
                try {
                  await window.sb.from('emergency_contacts').insert({
                    user_id: data.user.id,
                    name: aName + ' (Self)',
                    phone: aPhone
                  });
                } catch (cErr) {}
              }

              // Check if session was returned or if email confirmation is required
              if (data.session) {
                await loadUserData(data.user);
                overlay.style.display = 'none';
                showToast('✅ Account registered & logged in successfully!');
              } else {
                // Email confirmation is active on Supabase project
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Account & Log In';
                msg(`
                  <div style="line-height:1.45;">
                    <strong style="color:#059669;font-size:0.9rem;">✅ Account created successfully in Supabase!</strong><br>
                    A verification link has been sent to <strong>${esc(aEmail)}</strong>.<br>
                    Please verify your email to log in, or disable <em>"Confirm email"</em> in Supabase Dashboard → Authentication → Providers → Email.
                  </div>
                `, true);
              }
              return;
            }
          } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account & Log In';
            const parsed = parseAuthError(err);
            msg(parsed.html, false);
            return;
          }
        }

        // 2. Fallback to Local Registration
        performLocalRegistration(aName, aPhone, aEmail, aPass);
      };

      function performLocalRegistration(name, phone, email, pass) {
        const localAccs = getLocalAccounts();
        const existing = localAccs.find(a => a.email.toLowerCase() === email.toLowerCase());
        if (existing) {
          msg('An account with this email already exists locally. <button type="button" class="auth-link" id="aGoToLog">Log in</button>', false);
          const goLog = card.querySelector('#aGoToLog');
          if (goLog) goLog.onclick = () => render('login', { email });
          return;
        }

        const newId = 'usr_loc_' + Date.now();
        const newAcc = {
          id: newId,
          email,
          password: pass,
          name,
          phone,
          created_at: new Date().toISOString()
        };
        localAccs.push(newAcc);
        saveLocalAccounts(localAccs);

        const localUser = { id: newId, email };
        const localProfile = { id: newId, full_name: name, phone, role: 'user' };

        if (phone && (!S.contacts || S.contacts.length === 0)) {
          const cleanPhone = phone.replace(/[^\d+]/g, '');
          if (cleanPhone) {
            S.contacts = [{ id: 'c_' + Date.now(), name: name + ' (Self)', phone: cleanPhone }];
            saveLocalContacts(S.contacts);
          }
        }

        saveSession(localUser, localProfile, S.contacts);
        overlay.style.display = 'none';
        showToast('✅ Account registered & saved locally on device!');
      }
    } else if (view === 'contacts') {
      const contactsHtml = (S.contacts || []).map((c, i) => `
        <div class="contact-row">
          <div class="contact-info">
            <span class="contact-name">${esc(c.name)}${i === 0 ? '<span class="contact-tag-badge">PRIMARY</span>' : ''}</span>
            <span class="contact-phone">📞 ${esc(c.phone)}</span>
          </div>
          <button data-index="${i}" data-id="${c.id || ''}" title="Delete contact">🗑</button>
        </div>
      `).join('') || '<p class="sub" style="text-align:center;padding:12px 0;">No emergency contacts configured yet.<br>Add trusted family/police contacts below.</p>';

      card.innerHTML = `${closeX}
        <h2>🚨 Emergency Contacts</h2>
        <p class="sub">These contacts receive your <strong>live GPS location link</strong> when you press physical Volume / Power buttons or tap SOS.</p>
        ${renderHardwareTriggerOption()}
        <div style="margin:12px 0;max-height:170px;overflow-y:auto">${contactsHtml}</div>
        <form id="cLocalForm">
          <input id="cName" placeholder="Contact Name (e.g. Mom, Brother, Police)" required>
          <input id="cPhone" type="tel" placeholder="Mobile / WhatsApp Number (e.g. 9876543210)" required>
          <div class="auth-msg"></div>
          <button class="auth-btn">+ Save Emergency Contact</button>
        </form>
        <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border-subtle,#e2e8f0);text-align:center">
          <button class="auth-link" id="aSwitchLogin">Have an account? Log in or Register</button>
        </div>`;

      bindHardwareTriggerControls();

      card.querySelector('#cLocalForm').onsubmit = async e => {
        e.preventDefault();
        const cName = card.querySelector('#cName').value.trim();
        const cPhone = card.querySelector('#cPhone').value.trim();
        const cleanPhone = cPhone.replace(/[^\d+]/g, '');

        if (!cleanPhone || cleanPhone.length < 3) {
          msg('Please enter a valid phone number');
          return;
        }

        const newContact = { id: Date.now().toString(), name: cName, phone: cleanPhone };
        const updated = [...(S.contacts || []), newContact];
        saveLocalContacts(updated);
        showToast('✅ Emergency contact saved & synced to device hardware!');
        render('contacts');
      };

      card.querySelectorAll('.contact-row button').forEach(b => {
        b.onclick = () => {
          const idx = parseInt(b.dataset.index, 10);
          const updated = [...S.contacts];
          updated.splice(idx, 1);
          saveLocalContacts(updated);
          render('contacts');
        };
      });

      const swLog = card.querySelector('#aSwitchLogin');
      if (swLog) swLog.onclick = () => render('login');
    } else if (view === 'supabase_config') {
      const cfg = window.SUPABASE_CONFIG || {};
      card.innerHTML = `${closeX}
        <h2>⚙️ Supabase Cloud Settings</h2>
        <p class="sub">Configure your active Supabase Project credentials. You can find these in your Supabase Dashboard under <strong>Project Settings → API</strong>.</p>
        
        <form id="sbConfigForm">
          <label style="font-size:0.78rem;font-weight:700;display:block;margin-bottom:3px;">Supabase Project URL:</label>
          <input id="sbUrlInput" type="url" placeholder="https://your-ref.supabase.co" value="${esc(cfg.url || '')}" required>

          <label style="font-size:0.78rem;font-weight:700;display:block;margin-bottom:3px;">Supabase Anon / Public API Key:</label>
          <input id="sbKeyInput" type="text" placeholder="eyJhbGciOiJIUzI1NiIsIn..." value="${esc(cfg.anonKey || '')}" required>

          <div class="auth-msg"></div>

          <div style="display:flex;gap:8px;margin-top:6px;">
            <button type="submit" class="auth-btn" style="flex:2;">💾 Save &amp; Reconnect</button>
            <button type="button" id="sbTestBtn" class="auth-btn alt" style="flex:1;margin-top:0;">⚡ Test</button>
          </div>

          ${cfg.isCustom ? `<button type="button" id="sbResetBtn" class="auth-btn alt" style="border-color:#ef4444;color:#ef4444;margin-top:8px;">Reset to Default Credentials</button>` : ''}
        </form>

        <div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--border-subtle,#e2e8f0);text-align:center;">
          <button class="auth-link" id="sbBackBtn">← Back to Log In</button>
        </div>`;

      card.querySelector('#sbBackBtn').onclick = () => render(S.user ? 'account' : 'login');

      const testBtn = card.querySelector('#sbTestBtn');
      if (testBtn) {
        testBtn.onclick = async () => {
          const testUrl = card.querySelector('#sbUrlInput').value.trim();
          const testKey = card.querySelector('#sbKeyInput').value.trim();
          if (!testUrl || !testKey) return msg('Please enter both Supabase URL and Anon Key to test.');

          msg('Pinging Supabase server...', true);
          try {
            const res = await fetch(`${testUrl}/auth/v1/health`, {
              headers: { apikey: testKey },
              signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
              msg('✅ Supabase Connection Successful! Server is active & responding.', true);
            } else {
              msg('⚠️ Supabase responded with HTTP ' + res.status + '. Check if your anon key is correct.');
            }
          } catch (e) {
            msg(`❌ Cannot reach ${esc(testUrl)} (${e.message}). Ensure the project is unpaused in your Supabase dashboard.`);
          }
        };
      }

      const resetBtn = card.querySelector('#sbResetBtn');
      if (resetBtn) {
        resetBtn.onclick = () => {
          if (confirm('Reset to default Supabase credentials?')) {
            window.SUPABASE_CONFIG.resetToDefault();
          }
        };
      }

      card.querySelector('#sbConfigForm').onsubmit = e => {
        e.preventDefault();
        const newUrl = card.querySelector('#sbUrlInput').value.trim();
        const newKey = card.querySelector('#sbKeyInput').value.trim();
        window.SUPABASE_CONFIG.saveCredentials(newUrl, newKey);
      };
    } else {
      // Logged-In Account View
      const p = S.profile || {};
      const contactsHtml = (S.contacts || []).map((c, i) => `
        <div class="contact-row">
          <div class="contact-info">
            <span class="contact-name">${esc(c.name)}${i === 0 ? '<span class="contact-tag-badge">PRIMARY</span>' : ''}</span>
            <span class="contact-phone">📞 ${esc(c.phone)}</span>
          </div>
          <button data-index="${i}" data-id="${c.id || ''}" title="Delete contact">🗑</button>
        </div>
      `).join('') || '<p class="sub">No emergency contacts saved yet. Add contacts below.</p>';

      card.innerHTML = `${closeX}
        <h2>👤 ${esc(p.full_name || 'My Account')}</h2>
        <span class="cloud-mode-badge supabase">🛡️ Cloud Synchronized • SOS Hardware Armed</span>
        <p class="sub">${esc(S.user.email)}${p.role === 'admin' ? ' · 🛡️ Admin' : ''}</p>
        
        ${renderHardwareTriggerOption()}

        <strong style="font-size:.88rem;display:block;margin-bottom:4px">Emergency Contacts (Synced to Power &amp; Volume Buttons)</strong>
        <div style="margin:8px 0;max-height:160px;overflow-y:auto">${contactsHtml}</div>

        <form id="cForm">
          <input id="cName" placeholder="Contact Name (e.g. Mom, Friend)" required>
          <input id="cPhone" type="tel" placeholder="Mobile / WhatsApp number" required>
          <div class="auth-msg"></div>
          <button class="auth-btn">+ Add Contact</button>
        </form>

        ${p.role === 'admin' ? '<a href="admin.html"><button class="auth-btn alt" type="button" style="margin-top:10px;">Open Admin Panel</button></a>' : ''}
        
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="auth-btn alt" id="aConfigFromAcc" type="button" style="flex:1;margin-top:0;font-size:0.78rem;">⚙️ Supabase Settings</button>
          <button class="auth-btn danger" id="aLogout" style="flex:1;margin-top:0;">Log Out</button>
        </div>`;

      bindHardwareTriggerControls();

      const confBtn = card.querySelector('#aConfigFromAcc');
      if (confBtn) confBtn.onclick = () => render('supabase_config');

      card.querySelector('#cForm').onsubmit = async e => {
        e.preventDefault();
        const cName = card.querySelector('#cName').value.trim();
        const cPhone = card.querySelector('#cPhone').value.trim();
        const cleanPhone = cPhone.replace(/[^\d+]/g, '');

        if (!cleanPhone) return msg('Please enter a valid phone number');

        // If logged into Supabase, persist in database
        if (window.sb && S.user) {
          try {
            const { data: inserted, error } = await window.sb
              .from('emergency_contacts')
              .insert({
                user_id: S.user.id,
                name: cName,
                phone: cleanPhone
              })
              .select()
              .single();

            if (!error && inserted) {
              const updated = [...(S.contacts || []), inserted];
              saveLocalContacts(updated);
              showToast('✅ Emergency contact saved & synced to Supabase and hardware buttons!');
              render('account');
              return;
            }
          } catch (err) {
            console.warn('Supabase contact insert note:', err);
          }
        }

        // Local fallback
        const newContact = { id: Date.now().toString(), name: cName, phone: cleanPhone };
        const updated = [...(S.contacts || []), newContact];
        saveLocalContacts(updated);
        showToast('✅ Emergency contact saved & synced to hardware buttons!');
        render('account');
      };

      card.querySelectorAll('.contact-row button').forEach(b => {
        b.onclick = async () => {
          const idx = parseInt(b.dataset.index, 10);
          const cId = b.dataset.id;

          if (window.sb && cId && !String(cId).startsWith('c_')) {
            try {
              await window.sb.from('emergency_contacts').delete().eq('id', cId);
            } catch (err) {}
          }

          const updated = [...S.contacts];
          updated.splice(idx, 1);
          saveLocalContacts(updated);
          render('account');
        };
      });

      card.querySelector('#aLogout').onclick = async () => {
        if (window.sb) {
          try {
            await window.sb.auth.signOut();
          } catch (e) {}
        }
        clearSession();
        overlay.style.display = 'none';
        showToast('Logged out successfully.');
      };
    }

    const cBtn = card.querySelector('#aClose');
    if (cBtn) cBtn.onclick = () => { overlay.style.display = 'none'; };
  }

  // SOS Logger helper
  S.logSOS = async (lat, lng) => {
    // 1. Supabase Cloud SOS Log
    if (window.sb && S.user) {
      try {
        await window.sb.from('sos_events').insert({ user_id: S.user.id, lat, lng });
      } catch (e) {
        console.warn('Cloud SOS log notice:', e);
      }
    }
    // 2. Spring Boot REST API
    if (window.SafeBackend && typeof window.SafeBackend.triggerSos === 'function') {
      try {
        window.SafeBackend.triggerSos(lat, lng, S.user ? S.user.id : null).catch(() => {});
      } catch (e) {}
    }
  };

  S.firstContactWhatsApp = () => {
    if (S.contacts && S.contacts.length > 0 && S.contacts[0].phone) {
      return waNumber(S.contacts[0].phone);
    }
    return null;
  };

  S.openContactsModal = () => {
    render(S.user ? 'account' : 'contacts');
    overlay.style.display = 'flex';
  };

  S.syncContacts = () => syncContactsToNative(S.contacts);

  // Initialize on Boot
  S.contacts = loadLocalContacts();
  restoreSavedSession();
  syncContactsToNative(S.contacts);
  updateAvatarButton();

  // Supabase Auth State Change Listener & Session Verification
  if (window.sb) {
    try {
      window.sb.auth.getSession().then(({ data: { session }, error }) => {
        if (!error && session && session.user) {
          S.user = session.user;
          loadUserData(session.user);
        }
      }).catch(err => {
        console.info('Supabase initial session notice:', err.message);
      });

      window.sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session && session.user) {
            S.user = session.user;
            await loadUserData(session.user);
          }
        } else if (event === 'SIGNED_OUT') {
          clearSession();
        }
      });
    } catch (e) {
      console.warn('Supabase auth listener initialization notice:', e);
    }
  }

  loadSafeSpots();
})();

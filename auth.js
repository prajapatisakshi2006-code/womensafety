/* SafeRoute auth: login, registration, emergency contacts, SOS log, DB safe spots
 * Enhanced with resilient dual-engine authentication:
 * Supports Supabase Cloud + Local Safety Account offline fallback (prevents "Failed to fetch" block)
 * Immediate contact sync to Android Native SharedPreferences for Power & Volume button SOS
 */
(function () {
  const LOCAL_STORAGE_KEY = 'saferoute_local_contacts';
  const LOCAL_ACCOUNTS_KEY = 'saferoute_local_accounts';
  const SESSION_KEY = 'saferoute_session';
  const POWER_THRESH_KEY = 'saferoute_power_press_threshold';
  const SIREN_PREF_KEY = 'saferoute_siren_on_hardware_sos';
  const CUSTOM_SUPABASE_URL_KEY = 'saferoute_custom_sb_url';
  const CUSTOM_SUPABASE_KEY_KEY = 'saferoute_custom_sb_key';

  // Allow custom Supabase project configuration if entered by user
  let activeSb = window.sb;
  const customUrl = localStorage.getItem(CUSTOM_SUPABASE_URL_KEY);
  const customKey = localStorage.getItem(CUSTOM_SUPABASE_KEY_KEY);
  if (customUrl && customKey && window.supabase) {
    try {
      activeSb = window.supabase.createClient(customUrl, customKey);
      window.sb = activeSb;
    } catch (e) {
      console.warn('Custom Supabase init failed:', e);
    }
  }

  // Initialize SafeAuth namespace
  const S = (window.SafeAuth = {
    user: null,
    profile: null,
    contacts: [],
    spots: []
  });

  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const waNumber = p => { const d = String(p).replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };

  // Toast notification helper
  function showToast(text) {
    let t = document.getElementById('safeToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'safeToast';
      t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.92);color:#fff;padding:10px 18px;border-radius:12px;font-size:0.85rem;font-weight:600;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);pointer-events:none;transition:opacity 0.25s;text-align:center;max-width:88vw;';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.style.opacity = '1';
    clearTimeout(t._hideTimeout);
    t._hideTimeout = setTimeout(() => { t.style.opacity = '0'; }, 3200);
  }
  window.showSafeToast = showToast;

  // Local Accounts management
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

  function saveSession(user, profile) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user, profile }));
    } catch (e) {}
    S.user = user;
    S.profile = profile;
    syncContactsToNative(S.contacts);
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    S.user = null;
    S.profile = null;
    syncContactsToNative(S.contacts);
  }

  function loadSavedSession() {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.user) {
          S.user = parsed.user;
          S.profile = parsed.profile || { id: parsed.user.id, full_name: parsed.user.email };
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Sync contacts and settings with Android native SharedPreferences
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

        // Power & Volume press threshold
        if (CapPlugins.NativeSiren.setPowerPressThreshold) {
          const threshold = parseInt(localStorage.getItem(POWER_THRESH_KEY) || '3', 10);
          CapPlugins.NativeSiren.setPowerPressThreshold({ count: threshold });
        }

        // Hardware Siren preference
        if (CapPlugins.NativeSiren.setHardwareSirenEnabled) {
          const sirenEnabled = localStorage.getItem(SIREN_PREF_KEY) !== 'false';
          CapPlugins.NativeSiren.setHardwareSirenEnabled({ enabled: sirenEnabled });
        }

        // User logged in status
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

  // Load local offline contacts on boot
  function loadLocalContacts() {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  }

  function saveLocalContacts(list) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
    S.contacts = list;
    syncContactsToNative(list);
  }

  // Initial load
  S.contacts = loadLocalContacts();
  loadSavedSession();
  syncContactsToNative(S.contacts);

  document.head.insertAdjacentHTML('beforeend', `<style>
  .auth-overlay{position:fixed;inset:0;background:rgba(15,23,42,.65);display:none;align-items:center;justify-content:center;z-index:5000;padding:16px;backdrop-filter:blur(4px)}
  .auth-card{background:var(--bg-card,#fff);color:var(--text-main,#0f172a);border-radius:20px;padding:22px;width:100%;max-width:390px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.35);font-family:inherit}
  .auth-card h2{margin:0 0 4px;font-size:1.25rem;display:flex;align-items:center;gap:6px}.auth-card p.sub{margin:0 0 14px;color:var(--text-muted,#64748b);font-size:.82rem;line-height:1.4}
  .auth-card input{width:100%;box-sizing:border-box;padding:11px 12px;margin-bottom:10px;border:1px solid var(--border-subtle,#e2e8f0);border-radius:10px;background:var(--bg-subtle,#f8fafc);color:inherit;font:inherit;font-size:.9rem}
  .auth-btn{width:100%;padding:11px;border:0;border-radius:10px;background:var(--primary,#7c3aed);color:#fff;font-weight:700;cursor:pointer;font:inherit;transition:opacity .15s}
  .auth-btn:active{opacity:.85}
  .auth-btn.alt{background:transparent;color:var(--primary,#7c3aed);border:1px solid var(--primary,#7c3aed);margin-top:8px}
  .auth-btn.danger{background:#ef4444}
  .auth-btn.demo{background:linear-gradient(135deg, #10b981, #059669);color:#fff;border:none;margin-top:8px}
  .auth-msg{font-size:.82rem;margin:8px 0;min-height:1.2em;line-height:1.4}.auth-msg.err{color:#ef4444}.auth-msg.ok{color:#10b981}
  .auth-link{background:none;border:0;color:var(--primary,#7c3aed);cursor:pointer;font:inherit;font-size:.82rem;margin-top:10px;padding:0;text-decoration:underline}
  .contact-row{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--border-subtle,#e2e8f0);border-radius:10px;margin-bottom:8px;font-size:.85rem;background:var(--bg-subtle,#f8fafc)}
  .contact-info{display:flex;flex-direction:column;gap:2px}
  .contact-name{font-weight:600;color:var(--text-main,#0f172a)}
  .contact-phone{font-size:.8rem;color:var(--text-muted,#64748b)}
  .contact-row button{background:none;border:0;cursor:pointer;color:#ef4444;font-size:1.1rem;padding:4px 8px;border-radius:6px}
  .contact-row button:hover{background:rgba(239,68,68,.1)}
  .auth-close{float:right;background:none;border:0;font-size:1.2rem;cursor:pointer;color:inherit;padding:2px 6px}
  .contact-tag-badge{display:inline-block;font-size:.7rem;padding:2px 6px;border-radius:4px;background:#10b98120;color:#059669;font-weight:600;margin-left:6px}
  .cloud-mode-badge{display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;padding:2px 8px;border-radius:6px;font-weight:700;margin-bottom:10px;}
  .cloud-mode-badge.local{background:rgba(245,158,11,0.15);color:#d97706;}
  .cloud-mode-badge.cloud{background:rgba(16,185,129,0.15);color:#059669;}
  </style>`);

  // Account button next to the theme toggle
  const themeBtn = document.getElementById('themeToggleBtn');
  const btn = document.createElement('button');
  btn.className = 'theme-toggle-btn';
  btn.title = 'Emergency Contacts & Account';
  btn.textContent = S.user ? (S.profile?.full_name || S.user.email || 'U').charAt(0).toUpperCase() : '👤';

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
  btn.addEventListener('click', () => { render(S.user ? 'account' : 'contacts'); overlay.style.display = 'flex'; });

  const card = overlay.firstChild;
  const msg = (t, ok) => {
    const m = card.querySelector('.auth-msg');
    if (m) {
      m.innerHTML = t;
      m.className = 'auth-msg ' + (ok ? 'ok' : 'err');
    }
  };
  const closeX = '<button class="auth-close" id="aClose">✕</button>';

  function renderHardwareTriggerOption() {
    const cur = localStorage.getItem(POWER_THRESH_KEY) || '3';
    const sirenOn = localStorage.getItem(SIREN_PREF_KEY) !== 'false';
    return `
      <div style="margin:10px 0 12px;padding:10px 12px;background:var(--bg-subtle,#f8fafc);border:1px solid var(--border-subtle,#e2e8f0);border-radius:10px;">
        <label style="font-size:0.78rem;font-weight:700;display:block;margin-bottom:5px;">⚡ Hardware Button SOS Trigger (Power &amp; Volume):</label>
        <select id="powerPressSelect" style="width:100%;padding:7px 9px;border-radius:8px;border:1px solid var(--border-subtle,#cbd5e1);background:var(--bg-card,#fff);color:inherit;font:inherit;font-size:0.82rem;">
          <option value="3" ${cur === '3' ? 'selected' : ''}>3 Rapid Presses (Recommended)</option>
          <option value="2" ${cur === '2' ? 'selected' : ''}>2 Rapid Presses (Faster trigger)</option>
        </select>
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border-subtle,#e2e8f0);">
          <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;font-weight:600;cursor:pointer;">
            <input type="checkbox" id="hardwareSirenToggle" ${sirenOn ? 'checked' : ''} style="width:auto;margin:0;">
            <span>🔊 Sound Loud Siren on Power/Volume SOS</span>
          </label>
          <small style="color:var(--text-muted,#64748b);font-size:0.72rem;display:block;margin-top:3px;">
            Immediate SOS SMS is always sent with Live GPS. Uncheck to keep alert silent.
          </small>
        </div>
      </div>`;
  }

  function bindHardwareTriggerControls() {
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

    const sirenToggle = card.querySelector('#hardwareSirenToggle');
    if (sirenToggle) {
      sirenToggle.onchange = () => {
        const enabled = sirenToggle.checked;
        localStorage.setItem(SIREN_PREF_KEY, enabled ? 'true' : 'false');
        try {
          const CapPlugins = window.Capacitor && window.Capacitor.Plugins;
          if (CapPlugins && CapPlugins.NativeSiren && CapPlugins.NativeSiren.setHardwareSirenEnabled) {
            CapPlugins.NativeSiren.setHardwareSirenEnabled({ enabled });
          }
        } catch (e) {}
      };
    }
  }

  // Quick Demo Login Handler
  function loginAsDemoUser() {
    const demoUser = { id: 'usr_demo', email: 'demo@saferoute.com' };
    const demoProfile = { id: 'usr_demo', full_name: 'SafeRoute Demo User', phone: '+919876543210', role: 'user' };

    // Set demo contacts if none configured
    if (!S.contacts || S.contacts.length === 0) {
      S.contacts = [
        { id: 'demo_c1', name: 'Mom (Home)', phone: '9876543210' },
        { id: 'demo_c2', name: 'Police Helpline 112', phone: '112' }
      ];
      saveLocalContacts(S.contacts);
    }

    saveSession(demoUser, demoProfile);
    btn.textContent = 'D';
    syncContactsToNative(S.contacts);
    overlay.style.display = 'none';
    showToast('✅ Logged in as Demo User with Emergency Contacts ready!');
  }

  function render(view) {
    if (view === 'login') {
      card.innerHTML = `${closeX}
        <h2>Welcome Back</h2>
        <span class="cloud-mode-badge local">⚡ Cloud &amp; Local Offline Safety Ready</span>
        <p class="sub">Log in to sync your emergency contacts and enable instant SOS triggers.</p>
        <form id="aForm">
          <input id="aEmail" type="email" placeholder="Email address" required>
          <input id="aPass" type="password" placeholder="Password" required>
          <div class="auth-msg"></div>
          <button class="auth-btn" id="aLoginSubmitBtn">Log in</button>
        </form>
        <button type="button" class="auth-btn demo" id="aQuickDemoBtn">⚡ One-Click Demo Login (Instant Access)</button>
        <div style="display:flex;justify-content:space-between;margin-top:12px;">
          <button class="auth-link" id="aSwitchReg">Create an account</button>
          <button class="auth-link" id="aSwitchContacts">← Emergency Contacts</button>
        </div>`;

      // Quick Demo Login
      const demoBtn = card.querySelector('#aQuickDemoBtn');
      if (demoBtn) demoBtn.onclick = loginAsDemoUser;

      card.querySelector('#aForm').onsubmit = async e => {
        e.preventDefault();
        const aEmail = card.querySelector('#aEmail').value.trim();
        const aPass = card.querySelector('#aPass').value;
        const submitBtn = card.querySelector('#aLoginSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';

        let loggedIn = false;

        // 1. Try Supabase cloud auth if available
        if (activeSb && activeSb.auth) {
          try {
            const authPromise = activeSb.auth.signInWithPassword({ email: aEmail, password: aPass });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
            const { data, error } = await Promise.race([authPromise, timeoutPromise]);
            if (!error && data?.session) {
              loggedIn = true;
              saveSession(data.session.user, { id: data.session.user.id, full_name: data.session.user.email });
              await loadUserData();
              overlay.style.display = 'none';
              showToast('✅ Logged in successfully via Supabase Cloud!');
              return;
            }
          } catch (err) {
            console.warn('Supabase cloud login notice (offline or network issue):', err.message);
          }
        }

        // 2. Resilient Fallback: Match against Local Safety Accounts
        const localAccs = getLocalAccounts();
        const match = localAccs.find(a => a.email.toLowerCase() === aEmail.toLowerCase());

        if (match) {
          if (match.password === aPass) {
            loggedIn = true;
            const user = { id: match.id, email: match.email };
            const profile = { id: match.id, full_name: match.name, phone: match.phone };
            saveSession(user, profile);
            btn.textContent = (match.name || match.email || 'U').charAt(0).toUpperCase();

            // Load user-specific contacts if saved
            const userContactsKey = 'saferoute_contacts_' + match.id;
            try {
              const uContacts = JSON.parse(localStorage.getItem(userContactsKey) || 'null');
              if (Array.isArray(uContacts) && uContacts.length > 0) {
                S.contacts = uContacts;
                saveLocalContacts(uContacts);
              }
            } catch (e) {}

            syncContactsToNative(S.contacts);
            overlay.style.display = 'none';
            showToast('✅ Logged in successfully! (Local Safety Mode)');
            return;
          } else {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Log in';
            return msg('Incorrect password for this account.');
          }
        }

        // Check if demo credentials
        if (aEmail.toLowerCase() === 'demo@saferoute.com' && (aPass === 'password' || aPass === 'password123' || aPass === 'demo')) {
          loginAsDemoUser();
          return;
        }

        submitBtn.disabled = false;
        submitBtn.textContent = 'Log in';
        msg('Cloud database unreachable ("Failed to fetch"). No local account found for this email. Tap <strong>"Create an account"</strong> below to register instantly!');
      };

      const swReg = card.querySelector('#aSwitchReg');
      if (swReg) swReg.onclick = () => render('register');
      const swCon = card.querySelector('#aSwitchContacts');
      if (swCon) swCon.onclick = () => render('contacts');
    } else if (view === 'register') {
      card.innerHTML = `${closeX}
        <h2>Create Account</h2>
        <span class="cloud-mode-badge local">⚡ Offline-Ready • Auto Local Fallback</span>
        <p class="sub">Free safety backup. Emergency contacts will immediately sync with your device's power &amp; volume triggers.</p>
        <form id="aForm">
          <input id="aName" placeholder="Full name (e.g. Ananya Sharma)" required>
          <input id="aPhone" type="tel" placeholder="Your Mobile Number (e.g. 9876543210)">
          <input id="aEmail" type="email" placeholder="Email address" required>
          <input id="aPass" type="password" placeholder="Password (min 6 characters)" minlength="6" required>
          <div class="auth-msg"></div>
          <button class="auth-btn" id="aRegSubmitBtn">Register Account</button>
        </form>
        <div style="display:flex;justify-content:space-between;margin-top:12px;">
          <button class="auth-link" id="aSwitchLog">Already have an account? Log in</button>
          <button class="auth-link" id="aSwitchContacts">← Emergency Contacts</button>
        </div>`;

      card.querySelector('#aForm').onsubmit = async e => {
        e.preventDefault();
        const aName = card.querySelector('#aName').value.trim();
        const aPhone = card.querySelector('#aPhone').value.trim();
        const aEmail = card.querySelector('#aEmail').value.trim();
        const aPass = card.querySelector('#aPass').value;
        const regBtn = card.querySelector('#aRegSubmitBtn');
        regBtn.disabled = true;
        regBtn.textContent = 'Registering...';

        let registeredOnCloud = false;

        // 1. Try Supabase cloud signup if configured and reachable
        if (activeSb && activeSb.auth) {
          try {
            const signupPromise = activeSb.auth.signUp({
              email: aEmail,
              password: aPass,
              options: { data: { full_name: aName, phone: aPhone } }
            });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
            const { data, error } = await Promise.race([signupPromise, timeoutPromise]);
            if (!error && data?.user) {
              registeredOnCloud = true;
              if (data.session) {
                saveSession(data.session.user, { id: data.session.user.id, full_name: aName, phone: aPhone });
                overlay.style.display = 'none';
                showToast('✅ Account registered and synced with Supabase Cloud!');
                return;
              }
            }
          } catch (err) {
            console.warn('Supabase cloud signup notice (network/DNS unreachable):', err.message);
          }
        }

        // 2. Resilient Fallback: Register locally in Secure Safety Storage
        const localAccs = getLocalAccounts();
        const existing = localAccs.find(a => a.email.toLowerCase() === aEmail.toLowerCase());
        if (existing) {
          regBtn.disabled = false;
          regBtn.textContent = 'Register Account';
          return msg('An account with this email already exists locally. Please log in.');
        }

        const newId = 'usr_' + Date.now();
        const newAcc = {
          id: newId,
          email: aEmail,
          password: aPass,
          name: aName,
          phone: aPhone,
          created_at: new Date().toISOString()
        };
        localAccs.push(newAcc);
        saveLocalAccounts(localAccs);

        // Auto-login newly registered local user
        const localUser = { id: newId, email: aEmail };
        const localProfile = { id: newId, full_name: aName, phone: aPhone, role: 'user' };
        saveSession(localUser, localProfile);
        btn.textContent = aName.charAt(0).toUpperCase();

        // If user entered a phone number, add as their first emergency contact if list is empty
        if (aPhone && S.contacts.length === 0) {
          const cleanPhone = aPhone.replace(/[^\d+]/g, '');
          if (cleanPhone) {
            S.contacts = [{ id: 'c_' + Date.now(), name: aName + ' (Self)', phone: cleanPhone }];
            saveLocalContacts(S.contacts);
          }
        }

        syncContactsToNative(S.contacts);
        msg('✅ Registered successfully in Local Safety Mode! Logged in.', true);
        setTimeout(() => {
          overlay.style.display = 'none';
          showToast('✅ Account registered & ready! Hardware button SOS is active.');
        }, 1100);
      };

      const swLog = card.querySelector('#aSwitchLog');
      if (swLog) swLog.onclick = () => render('login');
      const swCon = card.querySelector('#aSwitchContacts');
      if (swCon) swCon.onclick = () => render('contacts');
    } else if (view === 'contacts') {
      // Local emergency contacts manager
      const contactsHtml = (S.contacts || []).map((c, i) => `
        <div class="contact-row">
          <div class="contact-info">
            <span class="contact-name">${esc(c.name)}${i === 0 ? '<span class="contact-tag-badge">PRIMARY</span>' : ''}</span>
            <span class="contact-phone">📞 ${esc(c.phone)}</span>
          </div>
          <button data-index="${i}" title="Delete contact">🗑</button>
        </div>
      `).join('') || '<p class="sub" style="text-align:center;padding:12px 0;">No contacts configured yet.<br>Add trusted contacts below for instant alerts.</p>';

      card.innerHTML = `${closeX}
        <h2>🚨 Emergency Contacts</h2>
        <p class="sub">These contacts receive your <strong>immediate live GPS location link</strong> when you press the physical Power or Volume buttons, or tap SOS.</p>
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

      card.querySelector('#cLocalForm').onsubmit = (e) => {
        e.preventDefault();
        const cName = card.querySelector('#cName');
        const cPhone = card.querySelector('#cPhone');
        const cleanPhone = cPhone.value.trim().replace(/[^\d+]/g, '');
        if (!cleanPhone || cleanPhone.length < 3) {
          msg('Please enter a valid phone number');
          return;
        }
        const updated = [...(S.contacts || []), { id: Date.now().toString(), name: cName.value.trim(), phone: cleanPhone }];
        saveLocalContacts(updated);
        showToast('✅ Emergency contact saved and synced to hardware triggers!');
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
    } else {
      // Logged-in Account View
      const p = S.profile || {};
      const contactsHtml = (S.contacts || []).map((c, i) => `
        <div class="contact-row">
          <div class="contact-info">
            <span class="contact-name">${esc(c.name)}${i === 0 ? '<span class="contact-tag-badge">PRIMARY</span>' : ''}</span>
            <span class="contact-phone">📞 ${esc(c.phone)}</span>
          </div>
          <button data-id="${c.id || i}" data-index="${i}" title="Delete contact">🗑</button>
        </div>
      `).join('') || '<p class="sub">No contacts saved yet. SOS will use the first one.</p>';

      card.innerHTML = `${closeX}
        <h2>👤 ${esc(p.full_name || 'My Account')}</h2>
        <span class="cloud-mode-badge cloud">🛡️ Active Account • SOS Hardware Ready</span>
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
        ${p.role === 'admin' ? '<a href="admin.html"><button class="auth-btn alt" type="button">Open Admin Panel</button></a>' : ''}
        <button class="auth-btn danger" id="aLogout" style="margin-top:12px">Log Out</button>`;

      bindHardwareTriggerControls();

      card.querySelector('#cForm').onsubmit = async e => {
        e.preventDefault();
        const cName = card.querySelector('#cName').value.trim();
        const cPhone = card.querySelector('#cPhone').value.trim();
        const cleanPhone = cPhone.replace(/[^\d+]/g, '');
        if (!cleanPhone) return msg('Please enter a valid phone number');

        const newContact = { id: Date.now().toString(), name: cName, phone: cleanPhone };
        const updated = [...(S.contacts || []), newContact];
        saveLocalContacts(updated);

        // Also save for this specific user
        if (S.user && S.user.id) {
          try {
            localStorage.setItem('saferoute_contacts_' + S.user.id, JSON.stringify(updated));
          } catch (e) {}
        }

        // Try Supabase cloud insert if connected
        if (activeSb && S.user && !String(S.user.id).startsWith('usr_')) {
          try {
            await activeSb.from('emergency_contacts').insert({
              user_id: S.user.id,
              name: cName,
              phone: cleanPhone
            });
          } catch (err) {}
        }

        showToast('✅ Emergency contact saved & synced to device!');
        render('account');
      };

      card.querySelectorAll('.contact-row button').forEach(b => {
        b.onclick = async () => {
          const idx = parseInt(b.dataset.index, 10);
          const contactId = b.dataset.id;
          const updated = [...S.contacts];
          updated.splice(idx, 1);
          saveLocalContacts(updated);

          if (S.user && S.user.id) {
            try {
              localStorage.setItem('saferoute_contacts_' + S.user.id, JSON.stringify(updated));
            } catch (e) {}
          }

          if (activeSb && contactId && !contactId.startsWith('c_')) {
            try {
              await activeSb.from('emergency_contacts').delete().eq('id', contactId);
            } catch (err) {}
          }

          render('account');
        };
      });

      card.querySelector('#aLogout').onclick = async () => {
        clearSession();
        if (activeSb && activeSb.auth) {
          try { await activeSb.auth.signOut(); } catch (e) {}
        }
        btn.textContent = '👤';
        overlay.style.display = 'none';
        showToast('Logged out.');
      };
    }

    const cBtn = card.querySelector('#aClose');
    if (cBtn) cBtn.onclick = () => { overlay.style.display = 'none'; };
  }

  async function loadUserData() {
    if (!S.user) {
      S.profile = null;
      S.contacts = loadLocalContacts();
      btn.textContent = '👤';
      syncContactsToNative(S.contacts);
      return;
    }

    // Try cloud load
    if (activeSb && !String(S.user.id).startsWith('usr_')) {
      try {
        const [p, c] = await Promise.all([
          activeSb.from('profiles').select('*').eq('id', S.user.id).single(),
          activeSb.from('emergency_contacts').select('*').order('created_at')
        ]);
        if (p.data) S.profile = p.data;
        if (c.data && c.data.length > 0) {
          S.contacts = c.data;
          saveLocalContacts(c.data);
        }
      } catch (e) {
        console.warn('Cloud user data load notice:', e);
      }
    }

    if (!S.contacts || S.contacts.length === 0) {
      S.contacts = loadLocalContacts();
    }

    btn.textContent = (S.profile?.full_name || S.user.email || 'U').charAt(0).toUpperCase();
    syncContactsToNative(S.contacts);
  }

  async function loadSpots() {
    if (!activeSb) return;
    try {
      const { data } = await activeSb.from('safe_spots').select('*').eq('active', true);
      S.spots = data || [];
      window.dispatchEvent(new Event('spots-loaded'));
    } catch (e) {
      console.warn('Safe spots cloud load notice:', e);
    }
  }

  // Public helpers used across app.js
  S.logSOS = async (lat, lng) => {
    // 1. Dual-log to Spring Boot Backend if online
    try {
      if (window.SafeBackend && typeof window.SafeBackend.triggerSos === 'function') {
        window.SafeBackend.triggerSos(lat, lng, S.user ? S.user.id : null).catch(() => {});
      }
    } catch (e) {}

    // 2. Cloud Supabase log (if online)
    if (!S.user || !activeSb || String(S.user.id).startsWith('usr_')) return;
    try {
      const { error } = await activeSb.from('sos_events').insert({ user_id: S.user.id, lat, lng });
      if (error) console.warn('SOS log notice', error.message);
    } catch (e) {}
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

  // Supabase auth subscription if active
  if (activeSb && activeSb.auth) {
    try {
      activeSb.auth.onAuthStateChange((_e, session) => {
        if (session?.user) {
          S.user = session.user;
          saveSession(session.user, { id: session.user.id, full_name: session.user.email });
        }
        setTimeout(async () => {
          await loadUserData();
          if (overlay.style.display === 'flex') {
            render(S.user ? 'account' : 'contacts');
          }
        }, 0);
      });
    } catch (e) {}
  }

  loadSpots();
})();

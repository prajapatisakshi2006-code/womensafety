/* SafeRoute auth: login, registration, emergency contacts, SOS log, DB safe spots */
(function () {
  const sb = window.sb;
  const S = (window.SafeAuth = { user: null, profile: null, contacts: [], spots: [] });
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const waNumber = p => { const d = String(p).replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };

  document.head.insertAdjacentHTML('beforeend', `<style>
  .auth-overlay{position:fixed;inset:0;background:rgba(15,23,42,.6);display:none;align-items:center;justify-content:center;z-index:5000;padding:16px}
  .auth-card{background:var(--bg-card,#fff);color:var(--text-main,#0f172a);border-radius:20px;padding:22px;width:100%;max-width:380px;max-height:90vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.3);font-family:inherit}
  .auth-card h2{margin:0 0 4px;font-size:1.25rem}.auth-card p.sub{margin:0 0 14px;color:var(--text-muted,#64748b);font-size:.82rem}
  .auth-card input{width:100%;box-sizing:border-box;padding:11px 12px;margin-bottom:10px;border:1px solid var(--border-subtle,#e2e8f0);border-radius:10px;background:var(--bg-subtle,#f8fafc);color:inherit;font:inherit;font-size:.9rem}
  .auth-btn{width:100%;padding:11px;border:0;border-radius:10px;background:var(--primary,#7c3aed);color:#fff;font-weight:700;cursor:pointer;font:inherit;font-weight:700}
  .auth-btn.alt{background:transparent;color:var(--primary,#7c3aed);border:1px solid var(--primary,#7c3aed);margin-top:8px}
  .auth-btn.danger{background:#ef4444}
  .auth-msg{font-size:.8rem;margin:8px 0;min-height:1em}.auth-msg.err{color:#ef4444}.auth-msg.ok{color:#10b981}
  .auth-link{background:none;border:0;color:var(--primary,#7c3aed);cursor:pointer;font:inherit;font-size:.82rem;margin-top:10px;padding:0}
  .contact-row{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid var(--border-subtle,#e2e8f0);border-radius:10px;margin-bottom:6px;font-size:.85rem}
  .contact-row button{background:none;border:0;cursor:pointer;color:#ef4444;font-size:1rem}
  .auth-close{float:right;background:none;border:0;font-size:1.1rem;cursor:pointer;color:inherit}
  </style>`);

  // Account button next to the theme toggle
  const themeBtn = document.getElementById('themeToggleBtn');
  const btn = document.createElement('button');
  btn.className = 'theme-toggle-btn'; btn.title = 'Account'; btn.textContent = '👤';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:8px';
  themeBtn.parentNode.insertBefore(wrap, themeBtn);
  wrap.append(btn, themeBtn);

  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.innerHTML = '<div class="auth-card" id="authCard"></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
  btn.addEventListener('click', () => { render(S.user ? 'account' : 'login'); overlay.style.display = 'flex'; });
  const card = overlay.firstChild;
  const msg = (t, ok) => { const m = card.querySelector('.auth-msg'); if (m) { m.textContent = t; m.className = 'auth-msg ' + (ok ? 'ok' : 'err'); } };
  const closeX = '<button class="auth-close" id="aClose">✕</button>';

  function render(view) {
    if (view === 'login') {
      card.innerHTML = `${closeX}<h2>Welcome back</h2><p class="sub">Log in to save contacts and log SOS alerts.</p>
        <form id="aForm"><input id="aEmail" type="email" placeholder="Email" required>
        <input id="aPass" type="password" placeholder="Password" required>
        <div class="auth-msg"></div><button class="auth-btn">Log in</button></form>
        <button class="auth-link" id="aSwitch">New here? Create an account</button>`;
      card.querySelector('#aForm').onsubmit = async e => {
        e.preventDefault();
        const { error } = await sb.auth.signInWithPassword({ email: aEmail.value.trim(), password: aPass.value });
        error ? msg(error.message) : (overlay.style.display = 'none');
      };
    } else if (view === 'register') {
      card.innerHTML = `${closeX}<h2>Create account</h2><p class="sub">Free. Your data stays private to you.</p>
        <form id="aForm"><input id="aName" placeholder="Full name" required>
        <input id="aPhone" type="tel" placeholder="Phone (optional)">
        <input id="aEmail" type="email" placeholder="Email" required>
        <input id="aPass" type="password" placeholder="Password (min 6 characters)" minlength="6" required>
        <div class="auth-msg"></div><button class="auth-btn">Register</button></form>
        <button class="auth-link" id="aSwitch">Already have an account? Log in</button>`;
      card.querySelector('#aForm').onsubmit = async e => {
        e.preventDefault();
        const { data, error } = await sb.auth.signUp({
          email: aEmail.value.trim(), password: aPass.value,
          options: { data: { full_name: aName.value.trim(), phone: aPhone.value.trim() } }
        });
        if (error) return msg(error.message);
        if (!data.session) msg('Check your email to confirm your account, then log in.', true);
        else overlay.style.display = 'none';
      };
    } else {
      const p = S.profile || {};
      card.innerHTML = `${closeX}<h2>${esc(p.full_name || 'My account')}</h2>
        <p class="sub">${esc(S.user.email)}${p.role === 'admin' ? ' · Admin' : ''}</p>
        <strong style="font-size:.85rem">Emergency contacts</strong>
        <div style="margin:8px 0">${S.contacts.map(c => `<div class="contact-row"><span>${esc(c.name)} · ${esc(c.phone)}</span><button data-id="${c.id}" title="Delete">🗑</button></div>`).join('') || '<p class="sub">None yet. SOS will use the first one.</p>'}</div>
        <form id="cForm"><input id="cName" placeholder="Contact name" required>
        <input id="cPhone" type="tel" placeholder="WhatsApp number (e.g. 98xxxxxxxx)" required>
        <div class="auth-msg"></div><button class="auth-btn">Add contact</button></form>
        ${p.role === 'admin' ? '<a href="admin.html"><button class="auth-btn alt" type="button">Open Admin Panel</button></a>' : ''}
        <button class="auth-btn danger" id="aLogout" style="margin-top:12px">Log out</button>`;
      card.querySelector('#cForm').onsubmit = async e => {
        e.preventDefault();
        const { error } = await sb.from('emergency_contacts').insert({ user_id: S.user.id, name: cName.value.trim(), phone: cPhone.value.trim() });
        if (error) return msg(error.message);
        await loadUserData(); render('account');
      };
      card.querySelectorAll('.contact-row button').forEach(b => b.onclick = async () => {
        await sb.from('emergency_contacts').delete().eq('id', b.dataset.id);
        await loadUserData(); render('account');
      });
      card.querySelector('#aLogout').onclick = async () => { await sb.auth.signOut(); overlay.style.display = 'none'; };
    }
    card.querySelector('#aClose').onclick = () => (overlay.style.display = 'none');
    const sw = card.querySelector('#aSwitch');
    if (sw) sw.onclick = () => render(view === 'login' ? 'register' : 'login');
  }

  async function loadUserData() {
    if (!S.user) { S.profile = null; S.contacts = []; btn.textContent = '👤'; return; }
    const [p, c] = await Promise.all([
      sb.from('profiles').select('*').eq('id', S.user.id).single(),
      sb.from('emergency_contacts').select('*').order('created_at')
    ]);
    S.profile = p.data; S.contacts = c.data || [];
    btn.textContent = (S.profile?.full_name || '?').charAt(0).toUpperCase();
  }

  async function loadSpots() {
    const { data } = await sb.from('safe_spots').select('*').eq('active', true);
    S.spots = data || [];
    window.dispatchEvent(new Event('spots-loaded'));
  }

  // Public helpers used by app.js
  S.logSOS = async (lat, lng) => {
    if (!S.user) return;
    const { error } = await sb.from('sos_events').insert({ user_id: S.user.id, lat, lng });
    if (error) console.warn('SOS log failed', error.message);
  };
  S.firstContactWhatsApp = () => (S.contacts[0] ? waNumber(S.contacts[0].phone) : null);

  // Defer DB calls out of the auth callback (recommended by Supabase)
  sb.auth.onAuthStateChange((_e, session) => {
    S.user = session?.user || null;
    setTimeout(async () => { await loadUserData(); if (overlay.style.display === 'flex') render(S.user ? 'account' : 'login'); }, 0);
  });
  loadSpots();
})();

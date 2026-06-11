/**
 * Login / register page — Aura Athletic
 */
(function () {
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:5001/api' : '/api';
  const pageParams = new URLSearchParams(window.location.search);
  const redirectTarget = pageParams.get('redirect') || '';
  const isAdminLogin = /admin\.html/i.test(redirectTarget);
  const isMemberHubLogin = /member-dashboard\.html/i.test(redirectTarget);

  const COPY = {
    member: {
      tag: 'Member access',
      sub: 'Sign in or create an account to book classes, manage your membership, and checkout online.',
      registerSub: 'Create your member account to continue.',
      title: 'Sign in — Aura Athletic'
    },
    memberHub: {
      tag: 'Member hub',
      sub: 'Sign in to open your dashboard — book classes, check membership, and view billing.',
      registerSub: 'Create your account to access the member hub.',
      title: 'Member hub sign in — Aura Athletic'
    },
    admin: {
      tag: 'Staff sign-in',
      sub: 'Use your admin credentials to access the dashboard.',
      registerSub: 'Create your member account to continue.',
      title: 'Admin sign in — Aura Athletic'
    }
  };

  function applyMemberHubMode() {
    if (!isMemberHubLogin || isAdminLogin) return;

    document.body.classList.add('auth-page-member-hub');
    document.title = COPY.memberHub.title;

    const layout = document.querySelector('.auth-layout');
    if (layout) layout.classList.add('auth-layout-member-hub');

    const tag = document.getElementById('authCardTag');
    const sub = document.getElementById('authCardSub');
    if (tag) tag.textContent = COPY.memberHub.tag;
    if (sub) sub.textContent = COPY.memberHub.sub;

    const submitBtn = document.getElementById('loginSubmitBtn');
    if (submitBtn) submitBtn.textContent = 'Sign in to member hub';

    document.querySelectorAll('.auth-member-hub-only').forEach((el) => {
      el.hidden = false;
    });
    document.querySelectorAll('.auth-member-hub-hide').forEach((el) => {
      el.hidden = true;
    });

    const hint = document.getElementById('login-hint');
    if (hint) {
      hint.classList.add('show', 'auth-member-hub-hint');
      hint.innerHTML =
        'Use your member account to continue. After sign-in you’ll go straight to your dashboard.';
    }
  }

  function applyAdminMode() {
    if (!isAdminLogin) return;

    document.body.classList.add('auth-page-admin');
    document.title = COPY.admin.title;

    const layout = document.querySelector('.auth-layout');
    if (layout) layout.classList.add('auth-layout-admin');

    const tag = document.getElementById('authCardTag');
    const sub = document.getElementById('authCardSub');
    if (tag) tag.textContent = COPY.admin.tag;
    if (sub) sub.textContent = COPY.admin.sub;

    const submitBtn = document.getElementById('loginSubmitBtn');
    if (submitBtn) submitBtn.textContent = 'Sign in to dashboard';

    document.querySelectorAll('.auth-member-only').forEach((el) => {
      el.hidden = true;
    });
    document.querySelectorAll('.auth-admin-only').forEach((el) => {
      el.hidden = false;
    });

    const registerView = document.getElementById('registerView');
    if (registerView) registerView.hidden = true;

    const hint = document.getElementById('login-hint');
    if (hint) {
      hint.classList.add('show', 'auth-admin-hint');
      hint.innerHTML =
        'Authorised staff only. You’ll be taken to the admin dashboard after sign-in.';
    }
  }

  function applyMemberCopy() {
    if (isMemberHubLogin) return;
    const tag = document.getElementById('authCardTag');
    const sub = document.getElementById('authCardSub');
    if (tag) tag.textContent = COPY.member.tag;
    if (sub) sub.textContent = COPY.member.sub;
    document.title = COPY.member.title;
  }

  function showLoginView() {
    const loginView = document.getElementById('loginView');
    const registerView = document.getElementById('registerView');
    const card = document.getElementById('authCard');
    const sub = document.getElementById('authCardSub');
    if (!loginView || !registerView) return;

    loginView.hidden = false;
    loginView.classList.add('auth-view-active');
    registerView.hidden = true;
    registerView.classList.remove('auth-view-active');
    card?.classList.remove('auth-card-register');
    document.body.classList.remove('auth-page-register-open');
    if (sub) {
      sub.textContent = isAdminLogin
        ? COPY.admin.sub
        : isMemberHubLogin
          ? COPY.memberHub.sub
          : COPY.member.sub;
    }
    const loginMsg = document.getElementById('loginMsg');
    if (loginMsg) loginMsg.innerHTML = '';
  }

  function showRegisterView() {
    if (isAdminLogin) return;

    const loginView = document.getElementById('loginView');
    const registerView = document.getElementById('registerView');
    const card = document.getElementById('authCard');
    const sub = document.getElementById('authCardSub');
    if (!loginView || !registerView) return;

    loginView.hidden = true;
    loginView.classList.remove('auth-view-active');
    registerView.hidden = false;
    registerView.classList.add('auth-view-active');
    card?.classList.add('auth-card-register');
    document.body.classList.add('auth-page-register-open');
    if (sub) {
      sub.textContent = isMemberHubLogin ? COPY.memberHub.registerSub : COPY.member.registerSub;
    }
    const registerMsg = document.getElementById('registerMsg');
    if (registerMsg) registerMsg.innerHTML = '';

    const roleSelect = document.getElementById('regRole');
    if (pageParams.get('reason') === 'checkout' && roleSelect) {
      roleSelect.value = 'member';
    }

    setTimeout(() => document.getElementById('regName')?.focus(), 50);
  }

  window.showLoginView = showLoginView;
  window.showRegisterView = showRegisterView;
  window.openRegisterBox = showRegisterView;
  window.closeRegisterBox = showLoginView;

  function showMsg(el, text, isError) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('error-msg', 'success-msg');
    if (isError) el.classList.add('error-msg');
    else if (/success|created|redirect/i.test(text)) el.classList.add('success-msg');
  }

  function init() {
    applyAdminMode();
    applyMemberHubMode();

    if (!isAdminLogin && !isMemberHubLogin) {
      applyMemberCopy();
    }

    document.getElementById('openRegisterBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      showRegisterView();
    });

    document.getElementById('showLoginBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginView();
    });

    document.getElementById('regRole')?.addEventListener('change', (e) => {
      const trainerFields = document.getElementById('trainerFields');
      if (trainerFields) {
        trainerFields.classList.toggle('show', e.target.value === 'trainer');
      }
    });

    if (pageParams.get('reason') === 'checkout' && !isAdminLogin && !isMemberHubLogin) {
      const hint = document.getElementById('login-hint');
      if (hint) {
        hint.classList.add('show');
        hint.innerHTML =
          'Sign in or register as a member to complete your membership purchase. ' +
          '<button type="button" class="auth-alert-action" id="hintRegisterBtn">Register now</button>';
        document.getElementById('hintRegisterBtn')?.addEventListener('click', (e) => {
          e.preventDefault();
          showRegisterView();
        });
      }
      const roleSelect = document.getElementById('regRole');
      if (roleSelect) roleSelect.value = 'member';
    }

    if (pageParams.get('tab') === 'register' || pageParams.get('mode') === 'register') {
      if (!isAdminLogin) showRegisterView();
    }

    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const msgDiv = document.getElementById('loginMsg');

      showMsg(msgDiv, 'Signing you in…', false);
      try {
        const res = await fetch(`${API_BASE}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        if (isAdminLogin && data.user.role !== 'admin') {
          localStorage.removeItem('auraUser');
          throw new Error('This portal is for admin accounts only. Use member sign-in for your dashboard.');
        }

        localStorage.setItem('auraUser', JSON.stringify(data.user));
        showMsg(msgDiv, 'Success! Redirecting…', false);
        const redirect = pageParams.get('redirect');
        if (redirect) {
          window.location.href = redirect.replace(/^\//, '');
        } else if (data.user.role === 'trainer') {
          window.location.href = 'trainer-dashboard.html';
        } else if (data.user.role === 'admin') {
          window.location.href = 'admin.html';
        } else {
          window.location.href = 'member-dashboard.html';
        }
      } catch (err) {
        showMsg(msgDiv, err.message, true);
      }
    });

    document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const role = document.getElementById('regRole').value;
      const msgDiv = document.getElementById('registerMsg');

      if (!name || !email || !password || !role) {
        showMsg(msgDiv, 'Please fill in all required fields.', true);
        return;
      }
      if (password.length < 6) {
        showMsg(msgDiv, 'Password must be at least 6 characters.', true);
        return;
      }

      const payload = { name, email, password, role };
      if (role === 'trainer') {
        payload.specialty = document.getElementById('regSpecialty').value || 'Fitness Trainer';
        payload.experience = document.getElementById('regExperience').value || '0+ years';
        payload.certifications = document.getElementById('regCertifications').value || 'Certified Trainer';
        payload.bio = document.getElementById('regBio').value || 'Passionate about fitness.';
      }

      showMsg(msgDiv, 'Creating your account…', false);
      try {
        const res = await fetch(`${API_BASE}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');

        const redirect = pageParams.get('redirect');
        const safeUser = { ...data.user };
        delete safeUser.password;
        localStorage.setItem('auraUser', JSON.stringify(safeUser));

        if (redirect && role === 'member') {
          showMsg(msgDiv, 'Account created! Taking you to checkout…', false);
          setTimeout(() => {
            window.location.href = redirect.replace(/^\//, '');
          }, 800);
          return;
        }

        showMsg(msgDiv, 'Account created! Redirecting…', false);
        setTimeout(() => {
          if (role === 'trainer') {
            window.location.href = 'trainer-dashboard.html';
          } else {
            window.location.href = redirect ? redirect.replace(/^\//, '') : 'member-dashboard.html';
          }
        }, 900);
      } catch (err) {
        showMsg(msgDiv, err.message, true);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

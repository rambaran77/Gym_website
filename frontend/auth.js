// auth.js - Role-based authentication for AuraAthletic

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:5001/api' : '/api';

const ROLES = {
    MEMBER: 'member',
    TRAINER: 'trainer',
    ADMIN: 'admin'
};

const PAGES = {
    MEMBER: ['member-dashboard.html', 'my-membership.html'],
    TRAINER: ['trainer-dashboard.html'],
    ADMIN: ['admin.html']
};

function getDashboardPath(role) {
    if (role === ROLES.TRAINER) return '/trainer-dashboard.html';
    if (role === ROLES.ADMIN) return '/admin.html';
    return '/member-dashboard.html';
}

async function registerUser(name, email, password, role, trainerDetails = {}) {
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role, ...trainerDetails })
        });
        const data = await response.json();
        if (!response.ok) {
            return { success: false, message: data.error || 'Registration failed' };
        }
        return { success: true, message: 'Registration successful', user: data.user };
    } catch (error) {
        console.error('Registration error:', error);
        return { success: false, message: 'Network error. Make sure server is running.' };
    }
}

async function loginUser(email, password) {
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) {
            return { success: false, message: data.error || 'Login failed' };
        }
        localStorage.setItem('auraUser', JSON.stringify(data.user));
        return { success: true, message: 'Login successful', role: data.user.role, user: data.user };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, message: 'Network error. Make sure server is running.' };
    }
}

function logoutUser() {
    localStorage.removeItem('auraUser');
    window.location.href = '/index.html';
}

function getCurrentUser() {
    const user = localStorage.getItem('auraUser');
    return user ? JSON.parse(user) : null;
}

function isLoggedIn() {
    return getCurrentUser() !== null;
}

function isAdmin() {
    const user = getCurrentUser();
    return user && user.role === ROLES.ADMIN;
}

function isTrainer() {
    const user = getCurrentUser();
    return user && user.role === ROLES.TRAINER;
}

function isMember() {
    const user = getCurrentUser();
    return user && user.role === ROLES.MEMBER;
}

function pathIncludes(fileName) {
    return window.location.pathname.includes(fileName);
}

function redirectBasedOnRole() {
    const user = getCurrentUser();
    const path = window.location.pathname;

    if (!user) {
        if (pathIncludes('admin.html') || pathIncludes('trainer-dashboard.html') ||
            pathIncludes('member-dashboard.html') || pathIncludes('checkout.html')) {
            const dest = pathIncludes('checkout.html')
                ? `login.html?redirect=${encodeURIComponent(getCheckoutReturnUrl())}&reason=checkout`
                : 'login.html';
            window.location.href = dest;
        }
        return;
    }

    if (user.role === ROLES.ADMIN) return;

    if (user.role === ROLES.TRAINER) {
        if (pathIncludes('admin.html')) {
            window.location.href = '/trainer-dashboard.html';
            return;
        }
        if (pathIncludes('member-dashboard.html') || pathIncludes('my-membership.html') ||
            pathIncludes('checkout.html')) {
            window.location.href = '/trainer-dashboard.html';
        }
        return;
    }

    if (user.role === ROLES.MEMBER) {
        if (pathIncludes('admin.html') || pathIncludes('trainer-dashboard.html')) {
            window.location.href = '/member-dashboard.html';
        }
    }
}

/** Call on member-only pages */
function requireMember() {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = '/login.html?redirect=member-dashboard.html';
        return false;
    }
    if (user.role === ROLES.TRAINER) {
        window.location.href = '/trainer-dashboard.html';
        return false;
    }
    if (user.role === ROLES.ADMIN) {
        window.location.href = '/admin.html';
        return false;
    }
    return true;
}

/**
 * MB-16: Members must be logged in before checkout (verified account email).
 * Returns logged-in user or redirects to login with return URL.
 */
function getCheckoutReturnUrl() {
    const params = new URLSearchParams(window.location.search);
    const qs = params.toString();
    return 'checkout.html' + (qs ? `?${qs}` : '');
}

function requireMemberForCheckout() {
    const user = getCurrentUser();
    const returnUrl = getCheckoutReturnUrl();

    if (!user) {
        window.location.href = `login.html?redirect=${encodeURIComponent(returnUrl)}&reason=checkout`;
        return null;
    }

    if (user.role === ROLES.TRAINER) {
        alert('Membership checkout is for member accounts. Use a member login or register as a member.');
        window.location.href = 'trainer-dashboard.html';
        return null;
    }

    return user;
}

/** Call on admin-only pages (MB-20) */
function requireAdmin() {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'login.html?redirect=admin.html';
        return false;
    }
    if (user.role !== ROLES.ADMIN) {
        window.location.href = getDashboardPath(user.role);
        return false;
    }
    return true;
}

/** Call on trainer-only pages */
function requireTrainer() {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = '/login.html?redirect=trainer-dashboard.html';
        return false;
    }
    if (user.role === ROLES.MEMBER) {
        window.location.href = '/member-dashboard.html';
        return false;
    }
    if (user.role === ROLES.ADMIN) {
        window.location.href = '/admin.html';
        return false;
    }
    return user.role === ROLES.TRAINER;
}

function updateNavbarAuth() {
    const user = getCurrentUser();
    let actionsDiv = document.querySelector('.nav-actions');
    const navLinks = document.querySelector('.nav-links');

    if (!actionsDiv && document.querySelector('.nav-container')) {
        actionsDiv = document.createElement('div');
        actionsDiv.className = 'nav-actions';
        document.querySelector('.nav-container').appendChild(actionsDiv);
    }
    if (!actionsDiv) return;

    if (user) {
        let dashboardLink = '';
        if (user.role === ROLES.TRAINER) {
            dashboardLink = '<a href="/trainer-dashboard.html" class="nav-dash-link">Trainer hub</a>';
        } else if (user.role === ROLES.ADMIN) {
            dashboardLink = '<a href="/admin.html" class="nav-dash-link">Admin</a>';
        } else {
            dashboardLink = '<a href="/member-dashboard.html" class="nav-dash-link">My hub</a>';
        }

        actionsDiv.innerHTML = `
            ${dashboardLink}
            <span class="user-greeting">👋 ${user.name}</span>
            <button type="button" onclick="logoutUser()" class="btn-logout">Logout</button>
        `;

        if (navLinks && user.role === ROLES.MEMBER) {
            const memberOnly = navLinks.querySelector('[data-member-nav]');
            if (!memberOnly) {
                const li = document.createElement('li');
                li.setAttribute('data-member-nav', '1');
                li.innerHTML = '<a href="/member-dashboard.html">Member hub</a>';
                navLinks.insertBefore(li, navLinks.children[1] || null);
            }
        }
    } else {
        actionsDiv.innerHTML = '<a href="/login.html" class="btn-login">Login</a>';
        if (navLinks) {
            const joinBtn = navLinks.querySelector('.btn-join-li');
            if (!joinBtn) {
                const joinLi = document.createElement('li');
                joinLi.className = 'btn-join-li';
                joinLi.innerHTML = '<a href="/schedule.html" class="btn-join">Join Now →</a>';
                navLinks.appendChild(joinLi);
            }
        }
    }
}

function initAuthUI() {
    updateNavbarAuth();
    redirectBasedOnRole();
}

document.addEventListener('DOMContentLoaded', initAuthUI);
document.addEventListener('aura-chrome-ready', updateNavbarAuth);

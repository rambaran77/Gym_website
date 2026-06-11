/**
 * Shared promo bar, navigation, and footer for Aura Athletic pages.
 * Set <body data-page="schedule"> for active nav highlighting.
 * Use data-no-chrome on body to skip injection (optional).
 */
(function () {
  const NAV = [
    { page: "home", label: "Home", href: "index.html" },
    { page: "memberships", label: "Memberships", href: "membership.html" },
    { page: "classes", label: "Classes", href: "classes.html" },
    { page: "schedule", label: "Timetable", href: "schedule.html" },
    { page: "trainers", label: "Trainers", href: "trainers.html" },
    { page: "daypass", label: "Day passes", href: "day-pass.html" },
    { page: "shop", label: "Shop", href: "shop.html" },
  ];

  const PROMO_HTML = `
    <div class="promo-strip" role="banner">
      <strong>50% off your 1st month</strong> — Use code: <strong>AURA50</strong> · No joining fee this week
    </div>`;

  function navHtml(active) {
    const links = NAV.map(
      (item) =>
        `<li><a href="${item.href}" class="${active === item.page ? "active" : ""}">${item.label}</a></li>`
    ).join("");
    return `
    <nav class="navbar" id="navbar">
      <div class="nav-container">
        <a href="index.html" class="logo">AURA ATHLETIC</a>
        <ul class="nav-links" id="navLinks">${links}</ul>
        <div class="nav-actions" id="navActions"></div>
        <button type="button" class="menu-btn" id="mobileMenuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="navLinks">
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>`;
  }

  const FOOTER_HTML = `
    <footer class="site-footer" id="site-footer">
      <div class="footer-grid">
        <div class="footer-col">
          <h4>About Aura Athletic</h4>
          <ul>
            <li><a href="about.html">About us</a></li>
            <li><a href="membership.html">Membership rules</a></li>
            <li><a href="admin.html">Admin</a></li>
            <li><a href="gymnotif.html">Help &amp; support</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>The gyms</h4>
          <ul>
            <li><a href="classes.html">Classes</a></li>
            <li><a href="schedule.html">Timetable</a></li>
            <li><a href="trainers.html">Personal training</a></li>
            <li><a href="index.html#find-gym">Gym locations</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Members</h4>
          <ul>
            <li><a href="login.html">Sign in</a></li>
            <li><a href="member-dashboard.html">Member hub</a></li>
            <li><a href="my-membership.html">My membership</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Legal</h4>
          <ul>
            <li><a href="membership.html">Membership agreement</a></li>
            <li><a href="#">Privacy policy</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Aura Athletic — Train with intensity · Rise with aura</p>
        <a href="#" class="back-to-top" onclick="window.scrollTo({top:0,behavior:'smooth'});return false;">Back to top ↑</a>
      </div>
    </footer>`;

  function closeMobileMenu() {
    const nav = document.getElementById("navLinks");
    const btn = document.getElementById("mobileMenuBtn") || document.querySelector(".menu-btn");
    if (nav) nav.classList.remove("show");
    document.body.classList.remove("menu-open");
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Open menu");
    }
  }

  function openMobileMenu() {
    const nav = document.getElementById("navLinks");
    const btn = document.getElementById("mobileMenuBtn") || document.querySelector(".menu-btn");
    if (nav) nav.classList.add("show");
    document.body.classList.add("menu-open");
    if (btn) {
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-label", "Close menu");
    }
  }

  window.toggleMobileMenu = function toggleMobileMenu() {
    const nav = document.getElementById("navLinks");
    if (!nav) return;
    if (nav.classList.contains("show")) closeMobileMenu();
    else openMobileMenu();
  };

  window.closeMobileMenu = closeMobileMenu;

  function ensureMobileNavBackdrop() {
    if (document.getElementById("mobileNavBackdrop")) return;
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.id = "mobileNavBackdrop";
    backdrop.className = "mobile-nav-backdrop";
    backdrop.setAttribute("aria-label", "Close menu");
    backdrop.addEventListener("click", closeMobileMenu);
    document.body.appendChild(backdrop);
  }

  function bindMobileMenuButton() {
    const btn = document.getElementById("mobileMenuBtn") || document.querySelector(".menu-btn");
    if (!btn || btn.dataset.menuBound === "true") return;
    btn.dataset.menuBound = "true";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.toggleMobileMenu();
    });
  }

  function markActiveNav(active) {
    if (!active) return;
    document.querySelectorAll("#navLinks a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const match =
        (active === "home" && (href === "index.html" || href === "/")) ||
        NAV.some((n) => n.page === active && href.includes(n.href.replace(".html", "")));
      a.classList.toggle("active", match);
    });
  }

  function initChrome() {
    const body = document.body;
    if (!body.classList.contains("site-page") || body.dataset.noChrome === "true") return;

    const active = body.dataset.page || "";

    if (!document.querySelector(".promo-strip")) {
      body.insertAdjacentHTML("afterbegin", PROMO_HTML);
    }

    if (!document.getElementById("navbar")) {
      const promo = document.querySelector(".promo-strip");
      if (promo) promo.insertAdjacentHTML("afterend", navHtml(active));
      else body.insertAdjacentHTML("afterbegin", navHtml(active));
    } else {
      markActiveNav(active);
    }

    if (!document.getElementById("site-footer") && body.dataset.noFooter !== "true") {
      body.insertAdjacentHTML("beforeend", FOOTER_HTML);
    }

    window.addEventListener("scroll", () => {
      const navbar = document.getElementById("navbar");
      if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 40);
    });

    ensureMobileNavBackdrop();
    bindMobileMenuButton();

    document.querySelectorAll("#navLinks a").forEach((link) => {
      link.addEventListener("click", closeMobileMenu);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMobileMenu();
    });

    window.addEventListener("pageshow", () => {
      closeMobileMenu();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) closeMobileMenu();
    });

    document.dispatchEvent(new Event("aura-chrome-ready"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChrome);
  } else {
    initChrome();
  }
})();

let products = [
    { id: 1, name: "Whey Protein", price: 40, stock: true, category: "supplements", image: "img/1.png", desc: "Muscle recovery protein supplement", ingredients: "Whey isolate, amino acids", reviews: "4.5/5" },
    { id: 2, name: "Gym Gloves", price: 15, stock: true, category: "equipment", image: "img/2.jpg", desc: "Grip gloves for weight training", ingredients: "Leather, foam", reviews: "4.2/5" },
    { id: 3, name: "Resistance Bands", price: 25, stock: false, category: "equipment", image: "img/3.png", desc: "Full body resistance training kit", ingredients: "Latex rubber", reviews: "4.7/5" },
    { id: 4, name: "Pre-Workout Powder", price: 30, stock: true, category: "supplements", image: "img/4.png", desc: "Energy boost before training", ingredients: "Caffeine, beta-alanine", reviews: "4.3/5" },
    { id: 5, name: "BCAA Drink", price: 20, stock: true, category: "supplements", image: "img/5.jpg", desc: "Hydration and muscle recovery drink", ingredients: "BCAA, electrolytes", reviews: "4.4/5" },
    { id: 6, name: "Gym Belt", price: 35, stock: true, category: "equipment", image: "img/6.png", desc: "Lower back support for lifting", ingredients: "Leather, steel buckle", reviews: "4.6/5" },
    { id: 7, name: "Dumbbells Set", price: 60, stock: false, category: "equipment", image: "img/7.jfif", desc: "Adjustable dumbbells for home gym", ingredients: "Cast iron, rubber coating", reviews: "4.8/5" },
    { id: 8, name: "Yoga Mat", price: 18, stock: true, category: "equipment", image: "img/8.png", desc: "Non-slip exercise mat", ingredients: "TPE foam", reviews: "4.5/5" },
    { id: 9, name: "Skipping Rope", price: 10, stock: true, category: "equipment", image: "img/9.png", desc: "Cardio jump rope", ingredients: "Steel cable, plastic handles", reviews: "4.1/5" },
    { id: 10, name: "Protein Bars", price: 12, stock: true, category: "supplements", image: "img/10.png", desc: "High protein snack bars", ingredients: "Oats, whey, chocolate", reviews: "4.3/5" },
    { id: 11, name: "Shaker Bottle", price: 8, stock: true, category: "accessories", image: "img/11.png", desc: "Protein mixing bottle", ingredients: "BPA-free plastic", reviews: "4.2/5" },
    { id: 12, name: "Creatine Powder", price: 28, stock: true, category: "supplements", image: "img/12.png", desc: "Strength and performance supplement", ingredients: "Creatine monohydrate", reviews: "4.6/5" },
    { id: 13, name: "Foam Roller", price: 22, stock: true, category: "equipment", image: "img/13.png", desc: "Muscle recovery roller", ingredients: "EVA foam", reviews: "4.5/5" },
    { id: 14, name: "Smart Fitness Watch", price: 120, stock: true, category: "accessories", image: "img/14.png", desc: "Track workouts and heart rate", ingredients: "Silicone, electronics", reviews: "4.7/5" },
    { id: 15, name: "Gym Backpack", price: 45, stock: true, category: "apparel", image: "img/15.png", desc: "Storage for gym essentials", ingredients: "Polyester", reviews: "4.4/5" },
    { id: 16, name: "Weight Plates", price: 80, stock: false, category: "equipment", image: "img/16.png", desc: "Barbell weight plates set", ingredients: "Cast iron", reviews: "4.6/5" },
    { id: 17, name: "Pull-Up Bar", price: 25, stock: true, category: "equipment", image: "img/17.png", desc: "Door frame pull-up bar", ingredients: "Steel", reviews: "4.3/5" },
    { id: 18, name: "Ankle Straps", price: 12, stock: true, category: "equipment", image: "img/18.png", desc: "Cable machine ankle straps", ingredients: "Neoprene, metal ring", reviews: "4.2/5" },
    { id: 19, name: "Massage Gun", price: 90, stock: true, category: "equipment", image: "img/19.png", desc: "Deep tissue muscle massage device", ingredients: "Plastic, metal motor", reviews: "4.8/5" },
    { id: 20, name: "Workout T-Shirt", price: 18, stock: true, category: "apparel", image: "img/20.png", desc: "Breathable gym shirt", ingredients: "Polyester blend", reviews: "4.4/5" },
    { id: 21, name: "Workout Pants", price: 25, stock: true, category: "apparel", image: "img/21.png", desc: "Breathable and flexible gym pants", ingredients: "Polyester blend", reviews: "4.7/5" }
];

let cart = JSON.parse(localStorage.getItem("cart")) || [];
let toastTimer;
let activeCategory = "all";

const CATEGORY_LABELS = {
    supplements: "Supplements",
    equipment: "Equipment",
    apparel: "Apparel",
    accessories: "Accessories"
};

function formatPrice(amount) {
    return Number(amount).toFixed(2);
}

function cartItemCount() {
    return cart.reduce((sum, item) => sum + item.qty, 0);
}

function isInCart(id) {
    return cart.some((c) => c.id === id);
}

function updateProductCountHint(count) {
    const el = document.getElementById("productCountHint");
    if (el) {
        el.textContent = count === 1 ? "1 product" : `${count} products`;
    }
}

function updateHighlights() {
    const inStock = products.filter((p) => p.stock).length;
    const el = document.getElementById("highlightInStock");
    if (el) el.textContent = String(inStock);
}

function syncCartBadges(count) {
    const n = count ?? cartItemCount();
    const countEl = document.getElementById("cartCount");
    const heroEl = document.getElementById("heroCartCount");
    if (countEl) countEl.textContent = n;
    if (heroEl) heroEl.textContent = n;
}

function getFilteredProducts() {
    const value = (document.getElementById("search")?.value || "").toLowerCase().trim();
    return products.filter((p) => {
        const matchesSearch = !value || p.name.toLowerCase().includes(value);
        const matchesCategory = activeCategory === "all" || p.category === activeCategory;
        return matchesSearch && matchesCategory;
    });
}

function getCartToggleRect() {
    const btn = document.getElementById("cartToggleBtn");
    return btn ? btn.getBoundingClientRect() : { left: window.innerWidth - 60, top: 80, width: 40, height: 40 };
}

function flyToCart(imageSrc, fromRect) {
    const target = getCartToggleRect();
    const fly = document.createElement("img");
    fly.src = imageSrc;
    fly.className = "fly-item";
    fly.alt = "";

    const startX = fromRect.left + fromRect.width / 2 - 28;
    const startY = fromRect.top + fromRect.height / 2 - 28;
    const endX = target.left + target.width / 2 - 28;
    const endY = target.top + target.height / 2 - 28;

    fly.style.left = `${startX}px`;
    fly.style.top = `${startY}px`;
    fly.style.transform = "scale(1)";
    fly.style.opacity = "1";

    document.getElementById("flyLayer").appendChild(fly);

    requestAnimationFrame(() => {
        fly.style.transform = `translate(${endX - startX}px, ${endY - startY}px) scale(0.15)`;
        fly.style.opacity = "0.2";
    });

    setTimeout(() => fly.remove(), 700);

    const toggle = document.getElementById("cartToggleBtn");
    if (toggle) {
        toggle.classList.remove("cart-bump");
        void toggle.offsetWidth;
        toggle.classList.add("cart-bump");
    }
}

function showToast(message) {
    const toast = document.getElementById("cartToast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => { toast.hidden = true; }, 350);
    }, 2200);
}

function openCartDrawer() {
    const drawer = document.getElementById("cartDrawer");
    const backdrop = document.getElementById("cartBackdrop");
    if (!drawer || !backdrop) return;

    drawer.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => {
        drawer.classList.add("is-open");
        backdrop.classList.add("is-visible");
    });
    document.body.classList.add("cart-open");
}

function closeCartDrawer() {
    const drawer = document.getElementById("cartDrawer");
    const backdrop = document.getElementById("cartBackdrop");
    if (!drawer || !backdrop) return;

    drawer.classList.remove("is-open");
    backdrop.classList.remove("is-visible");
    document.body.classList.remove("cart-open");

    setTimeout(() => {
        if (!drawer.classList.contains("is-open")) {
            drawer.hidden = true;
            backdrop.hidden = true;
        }
    }, 350);
}

function displayProducts(list = products) {
    const container = document.getElementById("productList");
    updateProductCountHint(list.length);

    if (!list.length) {
        container.innerHTML = '<p class="shop-empty">No products match your search. Try another name.</p>';
        return;
    }

    container.innerHTML = list.map((p) => {
        const inCart = isInCart(p.id);
        return `
        <article class="product-row ${p.stock ? "" : "out-of-stock"} ${inCart ? "in-cart" : ""}" data-id="${p.id}" role="button" tabindex="0" aria-label="Add ${p.name} to cart">
            <div class="product-row-media">
                <img src="${p.image}" alt="${p.name}" loading="lazy" />
                <span class="product-badge ${p.stock ? "in-stock" : "out-of-stock"}">${p.stock ? "In stock" : "Out of stock"}</span>
            </div>
            <div class="product-row-body">
                ${p.category ? `<span class="product-row-category">${CATEGORY_LABELS[p.category] || p.category}</span>` : ""}
                <h3>${p.name}</h3>
                <p class="product-row-desc">${p.desc}</p>
                <div class="product-row-meta">
                    <p class="product-price">£${formatPrice(p.price)}</p>
                    ${p.stock ? '<span class="product-row-hint">Tap row to add · flies to cart</span>' : ""}
                    ${inCart ? '<span class="product-row-hint" style="color:#0d9668">In your cart</span>' : ""}
                </div>
            </div>
            <div class="product-row-actions">
                <button type="button" class="btn-details" data-action="details">Product details</button>
                <button type="button" class="btn-add" data-action="add" ${p.stock ? "" : "disabled"}>${p.stock ? "Add to cart" : "Unavailable"}</button>
            </div>
        </article>
        `;
    }).join("");

    container.querySelectorAll(".product-row").forEach((row) => {
        const id = Number(row.dataset.id);
        const product = products.find((p) => p.id === id);
        if (!product) return;

        row.addEventListener("click", (e) => {
            if (e.target.closest("[data-action]")) return;
            if (!product.stock) return;
            addToCart(product, row.querySelector(".product-row-media"));
        });

        row.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && product.stock) {
                addToCart(product, row.querySelector(".product-row-media"));
            }
        });

        const detailsBtn = row.querySelector('[data-action="details"]');
        const addBtn = row.querySelector('[data-action="add"]');

        if (detailsBtn) {
            detailsBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openModal(id);
            });
        }

        if (addBtn) {
            addBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (product.stock) addToCart(product, row.querySelector(".product-row-media"));
            });
        }
    });
}

function filterProducts() {
    displayProducts(getFilteredProducts());
}

function setActiveCategory(category) {
    activeCategory = category;
    document.querySelectorAll(".shop-category-btn").forEach((btn) => {
        const on = btn.dataset.category === category;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    filterProducts();
}

function addToCart(product, mediaEl) {
    if (!product || !product.stock) return;

    const item = cart.find((c) => c.id === product.id);
    if (item) item.qty++;
    else cart.push({ ...product, qty: 1 });

    saveCart();

    const rectSource = mediaEl || document.querySelector(`.product-row[data-id="${product.id}"] .product-row-media`);
    if (rectSource) {
        flyToCart(product.image, rectSource.getBoundingClientRect());
    }

    showToast(`${product.name} added to cart`);
}

function changeQty(id, delta) {
    const item = cart.find((c) => c.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        cart = cart.filter((c) => c.id !== id);
    }
    saveCart();
}

function renderCart() {
    const container = document.getElementById("cartItems");
    const checkoutBtn = document.getElementById("checkoutBtn");
    const countEl = document.getElementById("cartCount");
    let total = 0;

    syncCartBadges();

    if (!cart.length) {
        container.innerHTML = '<p class="cart-empty-msg">Your cart is empty. Tap a product to add it here.</p>';
        document.getElementById("total").textContent = formatPrice(0);
        if (checkoutBtn) checkoutBtn.disabled = true;
        displayProducts(getFilteredProducts());
        return;
    }

    container.innerHTML = cart.map((item) => {
        const lineTotal = item.price * item.qty;
        total += lineTotal;
        return `
        <div class="cart-item">
            <img src="${item.image}" alt="" class="cart-item-thumb" />
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-meta">£${formatPrice(item.price)} each · £${formatPrice(lineTotal)}</div>
                <div class="cart-item-qty">
                    <button type="button" aria-label="Decrease quantity" onclick="changeQty(${item.id}, -1)">−</button>
                    <span>${item.qty}</span>
                    <button type="button" aria-label="Increase quantity" onclick="changeQty(${item.id}, 1)">+</button>
                </div>
            </div>
            <button type="button" class="cart-item-remove" onclick="removeItem(${item.id})" aria-label="Remove">×</button>
        </div>
        `;
    }).join("");

    document.getElementById("total").textContent = formatPrice(total);
    if (checkoutBtn) checkoutBtn.disabled = false;

    displayProducts(getFilteredProducts());
}

function removeItem(id) {
    cart = cart.filter((c) => c.id !== id);
    saveCart();
    showToast("Item removed");
}

function saveCart() {
    localStorage.setItem("cart", JSON.stringify(cart));
    renderCart();
}

function openModal(id) {
    const p = products.find((x) => x.id === id);
    if (!p) return;

    const modal = document.getElementById("modal");
    document.getElementById("modalBody").innerHTML = `
        <img src="${p.image}" class="modal-img" alt="${p.name}" />
        <h2 id="modalTitle">${p.name}</h2>
        <p>${p.desc}</p>
        <p class="modal-price">£${formatPrice(p.price)}</p>
        <p><strong>Ingredients:</strong> ${p.ingredients}</p>
        <p><strong>Rating:</strong> ${p.reviews}</p>
        <p class="${p.stock ? "instock" : "outstock"}">${p.stock ? "In stock — ready to ship" : "Currently out of stock"}</p>
        <div class="shop-modal-actions">
            <button type="button" class="btn-secondary" onclick="closeModal()">Close</button>
            <button type="button" class="btn-primary" id="modalAddBtn" ${p.stock ? "" : "disabled"}>${p.stock ? "Add to cart" : "Unavailable"}</button>
        </div>
    `;

    const modalAdd = document.getElementById("modalAddBtn");
    if (modalAdd && p.stock) {
        modalAdd.onclick = () => {
            addToCart(p, document.querySelector(".modal-img"));
            closeModal();
            openCartDrawer();
        };
    }

    modal.hidden = false;
    modal.classList.add("is-open");
    document.body.classList.add("cart-open");
}

function closeModal() {
    const modal = document.getElementById("modal");
    modal.classList.remove("is-open");
    modal.hidden = true;
    if (!document.getElementById("cartDrawer")?.classList.contains("is-open")) {
        document.body.classList.remove("cart-open");
    }
}

document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeModal();
        closeCartDrawer();
    }
});

function goToCheckout() {
    if (!cart.length) return;
    saveCart();
    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    localStorage.setItem("shopCheckout", JSON.stringify({
        source: "shop",
        items: cart,
        total
    }));
    window.location.href = "shop-checkout.html";
}

filterProducts();
renderCart();
updateHighlights();

document.getElementById("search")?.addEventListener("input", filterProducts);

document.getElementById("categoryPills")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".shop-category-btn");
    if (btn) setActiveCategory(btn.dataset.category);
});

/*
 * Panier ANAPHYS
 * 1. Réservation : le panier est réservé quelques minutes. À la fin, une pop-up laisse
 *    quelques secondes pour le garder (le délai repart), sinon le panier est vidé.
 * 2. « Complète ton rituel » : après un ajout depuis une fiche produit, une pop-up
 *    propose les produits complémentaires (métachamp custom.complementaires).
 */
(() => {
  const dataElement = document.getElementById('AnaphysCartData');
  if (!dataElement) return;

  let data;
  try {
    data = JSON.parse(dataElement.textContent);
  } catch (error) {
    return;
  }

  const settings = data.settings;
  const STORAGE_KEY = 'anaphys-cart-reserve';
  const UPSELL_SEEN_KEY = 'anaphys-upsell-seen';
  let count = data.count;
  let inCart = new Set(data.inCart);
  let memoryState = null;

  // Stockage navigateur, avec repli en mémoire si indisponible (navigation privée…)
  const storage = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        /* repli en mémoire */
      }
    },
  };

  const readState = () => storage.get(STORAGE_KEY, memoryState);
  const writeState = (state) => {
    memoryState = state;
    storage.set(STORAGE_KEY, state);
  };

  /* ---------- Mise à jour du panier affiché ---------- */

  const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

  function applySections(sections) {
    if (!sections) return;
    const drawer = document.querySelector('cart-drawer');
    if (drawer && sections['cart-drawer']) {
      const doc = parse(sections['cart-drawer']);
      const source = doc.querySelector('#CartDrawer');
      const target = document.getElementById('CartDrawer');
      if (source && target) {
        target.innerHTML = source.innerHTML;
        target.querySelector('#CartDrawer-Overlay')?.addEventListener('click', () => drawer.close());
      }
      drawer.classList.toggle('is-empty', Boolean(doc.querySelector('cart-drawer.is-empty')));
    }
    const bubble = document.getElementById('cart-icon-bubble');
    if (bubble && sections['cart-icon-bubble']) {
      const source = parse(sections['cart-icon-bubble']).querySelector('.shopify-section');
      if (source) bubble.innerHTML = source.innerHTML;
    }
  }

  async function refreshCartState() {
    try {
      const cart = await fetch(`${window.routes.cart_url}.js`).then((response) => response.json());
      count = cart.item_count;
      inCart = new Set(cart.items.map((item) => item.product_id));
    } catch (error) {
      /* on garde l'état connu */
    }
    syncReservation();
  }

  /* ---------- 1. Réservation du panier ---------- */

  function syncReservation() {
    if (count > 0) {
      const state = readState();
      if (!state || !state.expires) writeState({ expires: Date.now() + settings.minutes * 60000 });
    } else {
      writeState(null);
    }
    tick();
  }

  const format = (milliseconds) => {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const expiryDialog = document.getElementById('AnaphysCartExpiry');
  let warningOpen = false;
  let warningInterval = null;

  function tick() {
    const timers = document.querySelectorAll('[data-cart-timer]');
    const state = readState();
    if (!settings.timer || count === 0 || !state) {
      timers.forEach((timer) => (timer.hidden = true));
      return;
    }
    const left = state.expires - Date.now();
    timers.forEach((timer) => {
      timer.hidden = false;
      const time = timer.querySelector('[data-cart-timer-time]');
      if (time) time.textContent = format(left);
    });
    if (left <= 0 && !warningOpen) openWarning();
  }

  function openWarning() {
    if (!expiryDialog || typeof expiryDialog.showModal !== 'function') return;
    warningOpen = true;
    const warning = expiryDialog.querySelector('[data-expiry-warning]');
    const cleared = expiryDialog.querySelector('[data-expiry-cleared]');
    const countElement = expiryDialog.querySelector('[data-expiry-count]');
    const bar = expiryDialog.querySelector('[data-expiry-bar]');
    warning.hidden = false;
    cleared.hidden = true;

    let remaining = settings.warning;
    countElement.textContent = remaining;
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    expiryDialog.showModal();
    requestAnimationFrame(() => {
      bar.style.transition = `transform ${settings.warning}s linear`;
      bar.style.transform = 'scaleX(0)';
    });

    warningInterval = setInterval(() => {
      remaining -= 1;
      countElement.textContent = Math.max(remaining, 0);
      if (remaining <= 0) {
        clearInterval(warningInterval);
        clearCart();
      }
    }, 1000);
  }

  function keepCart() {
    clearInterval(warningInterval);
    writeState({ expires: Date.now() + settings.extend * 60000 });
    warningOpen = false;
    expiryDialog.close();
    tick();
  }

  async function clearCart() {
    try {
      const response = await fetch(`${window.routes.cart_url}/clear.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sections: ['cart-drawer', 'cart-icon-bubble'], sections_url: window.location.pathname }),
      }).then((r) => r.json());
      applySections(response.sections);
    } catch (error) {
      /* le panier sera relu au prochain chargement */
    }
    count = 0;
    inCart = new Set();
    writeState(null);
    tick();
    if (window.location.pathname === window.routes.cart_url) {
      window.location.reload();
      return;
    }
    expiryDialog.querySelector('[data-expiry-warning]').hidden = true;
    expiryDialog.querySelector('[data-expiry-cleared]').hidden = false;
    expiryDialog.querySelector('[data-expiry-cleared] [data-modal-close]')?.focus();
  }

  if (expiryDialog) {
    expiryDialog.querySelector('[data-expiry-keep]').addEventListener('click', keepCart);
    // Échap pendant l'alerte = le client est là : on garde le panier
    expiryDialog.addEventListener('cancel', (event) => {
      if (!expiryDialog.querySelector('[data-expiry-warning]').hidden) {
        event.preventDefault();
        keepCart();
      }
    });
    expiryDialog.addEventListener('close', () => {
      if (!expiryDialog.querySelector('[data-expiry-cleared]').hidden) warningOpen = false;
    });
  }

  // Un autre onglet a gardé ou vidé le panier
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    if (warningOpen && readState() && readState().expires > Date.now()) {
      clearInterval(warningInterval);
      warningOpen = false;
      expiryDialog?.close();
    }
    tick();
  });

  /* ---------- 2. Complète ton rituel ---------- */

  const upsellDialog = document.getElementById('AnaphysUpsell');

  function addedProductId(cartData) {
    if (!cartData) return null;
    if (cartData.product_id) return cartData.product_id;
    if (Array.isArray(cartData.items) && cartData.items[0]) return cartData.items[0].product_id;
    return null;
  }

  function buildCard(product) {
    const item = document.createElement('li');
    item.className = 'anaphys-upsell__item';

    const link = document.createElement('a');
    link.className = 'anaphys-upsell__media';
    link.href = product.url;
    link.tabIndex = -1;
    link.setAttribute('aria-hidden', 'true');
    if (product.image) {
      const image = document.createElement('img');
      image.src = product.image;
      image.alt = '';
      image.width = 120;
      image.height = 120;
      image.loading = 'lazy';
      link.appendChild(image);
    }

    const body = document.createElement('div');
    body.className = 'anaphys-upsell__body';
    if (product.step) {
      const step = document.createElement('p');
      step.className = 'anaphys-upsell__step';
      step.textContent = product.step;
      body.appendChild(step);
    }
    const title = document.createElement('a');
    title.className = 'anaphys-upsell__title';
    title.href = product.url;
    title.textContent = product.title;
    body.appendChild(title);
    if (product.hook) {
      const hook = document.createElement('p');
      hook.className = 'anaphys-upsell__hook';
      hook.textContent = product.hook;
      body.appendChild(hook);
    }
    const price = document.createElement('p');
    price.className = 'anaphys-upsell__price';
    price.textContent = product.price;
    body.appendChild(price);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'anaphys-upsell__add';
    button.textContent = 'Ajouter';
    button.setAttribute('aria-label', `Ajouter ${product.title} au panier`);
    button.addEventListener('click', () => addFromUpsell(product, button));

    item.append(link, body, button);
    return item;
  }

  async function addFromUpsell(product, button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(window.routes.cart_add_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: [{ id: product.variant, quantity: 1 }],
          sections: ['cart-drawer', 'cart-icon-bubble'],
          sections_url: window.location.pathname,
        }),
      }).then((r) => r.json());
      if (response.status) throw new Error(response.description || response.message);
      applySections(response.sections);
      inCart.add(product.id);
      count += 1;
      syncReservation();
      button.textContent = 'Ajouté';
      button.classList.add('is-added');
      button.removeAttribute('aria-busy');
    } catch (error) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = 'Réessayer';
    }
  }

  function showUpsell(productId) {
    if (!upsellDialog || !settings.upsell || typeof upsellDialog.showModal !== 'function') return;
    const seen = new Set(storage.get(UPSELL_SEEN_KEY, []));
    if (seen.has(productId)) return;
    const recommendations = (data.products[String(productId)] || [])
      .filter((product) => product.available && product.variant && !inCart.has(product.id))
      .slice(0, settings.upsellCount);
    if (recommendations.length === 0) return;

    seen.add(productId);
    storage.set(UPSELL_SEEN_KEY, [...seen]);

    const list = upsellDialog.querySelector('[data-upsell-list]');
    list.replaceChildren(...recommendations.map(buildCard));
    // Laisse le tiroir du panier s'ouvrir, puis affiche la pop-up par-dessus
    setTimeout(() => {
      if (warningOpen || upsellDialog.open) return;
      upsellDialog.showModal();
    }, 350);
  }

  if (upsellDialog) {
    upsellDialog.querySelector('[data-upsell-cart]').addEventListener('click', () => {
      upsellDialog.close();
      const drawer = document.querySelector('cart-drawer');
      if (settings.drawer && drawer) {
        if (!drawer.classList.contains('active')) drawer.open();
      } else {
        window.location.href = window.routes.cart_url;
      }
    });
  }

  /* ---------- Commun ---------- */

  // Fermer : boutons « fermer » et clic sur le fond
  document.querySelectorAll('.anaphys-modal').forEach((dialog) => {
    dialog.querySelectorAll('[data-modal-close]').forEach((button) =>
      button.addEventListener('click', () => dialog.close())
    );
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog && dialog !== expiryDialog) dialog.close();
    });
  });

  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.cartUpdate, async (event) => {
      await refreshCartState();
      if (event && event.source === 'product-form') {
        const productId = addedProductId(event.cartData);
        if (productId) showUpsell(productId);
      }
    });
  }

  syncReservation();
  setInterval(tick, 1000);
})();

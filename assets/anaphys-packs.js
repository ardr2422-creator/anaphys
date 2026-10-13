/*
 * Packs ANAPHYS : un clic ajoute tous les soins du pack (ou ceux qui manquent, depuis le panier).
 * Le tiroir du panier est rafraîchi puis ouvert ; sur la page panier, on recharge.
 */
if (!window.anaphysPacksReady) {
  window.anaphysPacksReady = true;

  const setState = (button, state) => {
    const label = button.querySelector('.anaphys-pack__add-label');
    const done = button.querySelector('.anaphys-pack__add-done');
    const spinner = button.querySelector('.loading__spinner');
    button.disabled = state === 'loading';
    button.setAttribute('aria-busy', String(state === 'loading'));
    button.classList.toggle('loading', state === 'loading');
    spinner?.classList.toggle('hidden', state !== 'loading');
    if (label) label.hidden = state === 'done';
    if (done) done.hidden = state !== 'done';
    button.classList.toggle('is-added', state === 'done');
  };

  const showError = (button, message) => {
    const error = button.parentElement.querySelector('[data-pack-error]');
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  };

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-pack-add]');
    if (!button || button.disabled) return;
    event.preventDefault();

    const ids = (button.dataset.variants || '').split(',').filter(Boolean);
    if (ids.length === 0) return;

    const drawer = document.querySelector('cart-drawer');
    const onCartPage = window.location.pathname === window.routes.cart_url;
    const useDrawer = drawer && typeof drawer.renderContents === 'function' && !onCartPage;

    showError(button, '');
    setState(button, 'loading');
    try {
      const response = await fetch(window.routes.cart_add_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: ids.map((id) => ({ id: Number(id), quantity: 1 })),
          ...(useDrawer
            ? {
                sections: drawer.getSectionsToRender().map((section) => section.id),
                sections_url: window.location.pathname,
              }
            : {}),
        }),
      }).then((r) => r.json());
      if (response.status) throw new Error(response.description || response.message);

      if (!useDrawer) {
        window.location.href = window.routes.cart_url;
        return;
      }

      setState(button, 'done');
      setTimeout(() => setState(button, 'idle'), 2500);
      if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'anaphys-pack', cartData: response });
      }
      drawer.classList.remove('is-empty');
      drawer.renderContents(response);
    } catch (error) {
      setState(button, 'idle');
      showError(button, error.message || "Le pack n'a pas pu être ajouté. Réessaie.");
    }
  });
}

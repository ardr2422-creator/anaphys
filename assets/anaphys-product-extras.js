/*
 * Fiche produit ANAPHYS : articles ajoutés « en plus » du soin, dans le même envoi.
 * Un champ caché [data-extra-item] actif (cadeau de l'offre, supplément de personnalisation)
 * transforme l'envoi du formulaire en liste d'articles : le soin (avec ses propriétés),
 * puis chaque article en plus.
 */
if (!window.anaphysExtrasReady) {
  window.anaphysExtrasReady = true;

  const extrasFor = (form) =>
    [...document.querySelectorAll(`[data-extra-item][form="${form.id}"]`)].filter((input) => !input.disabled);

  // Phase de capture : passe avant le gestionnaire d'envoi de Dawn, qui lit ensuite le formulaire.
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.closest('product-form')) return;

      // Personnalisation : prénom obligatoire quand l'option est cochée
      const perso = document.querySelector(`anaphys-personalize[data-form-id="${form.id}"]`);
      if (perso && !perso.validate()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const extras = extrasFor(form);
      if (extras.length === 0) return;

      const data = new FormData(form);
      const id = data.get('id');
      if (!id) return;
      const quantity = data.get('quantity') || '1';

      const added = [];
      const add = (name, value) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
        added.push(input);
      };

      add('items[0][id]', id);
      add('items[0][quantity]', quantity);
      for (const [name, value] of data.entries()) {
        const match = name.match(/^properties\[(.+)\]$/);
        if (match && value !== '') add(`items[0][properties][${match[1]}]`, value);
      }
      extras.forEach((extra, index) => {
        const n = index + 1;
        add(`items[${n}][id]`, extra.dataset.variant);
        add(`items[${n}][quantity]`, 'followQuantity' in extra.dataset ? quantity : extra.dataset.quantity || '1');
        if (extra.dataset.properties) {
          try {
            Object.entries(JSON.parse(extra.dataset.properties)).forEach(([key, value]) =>
              add(`items[${n}][properties][${key}]`, value)
            );
          } catch (error) {
            /* propriétés ignorées */
          }
        }
      });

      // Les champs d'origine sont mis de côté le temps que Dawn lise le formulaire
      const originals = [
        ...form.querySelectorAll('[name="id"], [name="quantity"]'),
        ...document.querySelectorAll(`[form="${form.id}"][name="quantity"], [form="${form.id}"][name^="properties["]`),
        ...extras,
      ].filter((input) => !input.disabled);
      originals.forEach((input) => (input.disabled = true));
      setTimeout(() => {
        added.forEach((input) => input.remove());
        originals.forEach((input) => (input.disabled = false));
      });
    },
    true
  );
}

if (!customElements.get('anaphys-personalize')) {
  customElements.define(
    'anaphys-personalize',
    class AnaphysPersonalize extends HTMLElement {
      connectedCallback() {
        this.toggle = this.querySelector('[data-perso-toggle]');
        this.panel = this.querySelector('[data-perso-panel]');
        this.name = this.querySelector('[data-perso-name]');
        this.ref = this.querySelector('[data-perso-ref]');
        this.colors = [...this.querySelectorAll('[data-perso-color]')];
        this.extra = this.querySelector('[data-extra-item]');
        this.error = this.querySelector('[data-perso-error]');
        this.label = this.querySelector('[data-perso-label]');
        this.previewName = this.querySelector('[data-perso-preview-name]');
        this.previewRef = this.querySelector('[data-perso-preview-ref]');
        this.placeholderName = this.previewName.textContent;

        this.toggle.addEventListener('change', () => this.setActive(this.toggle.checked));
        this.name.addEventListener('input', () => {
          this.error.hidden = true;
          this.name.removeAttribute('aria-invalid');
          this.render();
        });
        this.ref.addEventListener('input', () => this.render());
        this.colors.forEach((radio) => radio.addEventListener('change', () => this.render()));
        this.render();
      }

      get section() {
        return this.closest('section, .shopify-section') || document;
      }

      setActive(active) {
        this.panel.hidden = !active;
        [this.name, this.ref, this.extra, ...this.colors].forEach((input) => (input.disabled = !active));
        this.classList.toggle('is-active', active);
        // Le paiement express ne sait pas ajouter le supplément : on le cache pendant la personnalisation
        this.section.querySelectorAll('.shopify-payment-button').forEach((button) => (button.hidden = active));
        if (active) this.name.focus({ preventScroll: true });
        this.render();
      }

      validate() {
        if (!this.toggle.checked) return true;
        if (this.name.value.trim() !== '') return true;
        this.error.hidden = false;
        this.name.setAttribute('aria-invalid', 'true');
        this.name.setAttribute('aria-describedby', this.error.id);
        this.name.focus();
        return false;
      }

      render() {
        const name = this.name.value.trim();
        const ref = this.ref.value.trim();
        const color = this.colors.find((radio) => radio.checked);
        this.previewName.textContent = name || this.placeholderName;
        this.previewName.classList.toggle('is-placeholder', !name);
        this.previewRef.textContent = ref;
        this.previewRef.hidden = !ref;
        if (color) {
          const value = color.dataset.color;
          this.label.style.setProperty('--label-bg', value);
          this.label.classList.toggle('is-dark', this.isDark(value));
        }
        // Le supplément garde la trace du soin et du prénom (visible dans la commande)
        this.extra.dataset.properties = JSON.stringify({
          Soin: this.dataset.productTitle,
          ...(name ? { Prénom: name } : {}),
        });
      }

      isDark(hex) {
        const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
        if (!match) return false;
        const n = parseInt(match[1], 16);
        const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        return 0.299 * r + 0.587 * g + 0.114 * b < 140;
      }
    }
  );
}

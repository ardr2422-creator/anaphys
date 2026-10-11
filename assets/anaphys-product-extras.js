/*
 * Fiche produit ANAPHYS : articles ajoutés « en plus » du soin, dans le même envoi.
 * Un champ caché [data-extra-item] actif (cadeau de l'offre, supplément de personnalisation)
 * transforme l'envoi du formulaire en liste d'articles : le soin (avec ses propriétés),
 * puis chaque article en plus.
 */
if (!window.anaphysExtrasReady) {
  window.anaphysExtrasReady = true;

  // getAttribute : form.id renverrait le champ nommé « id » du formulaire produit
  const formId = (form) => form.getAttribute('id');
  const extrasFor = (form) =>
    [...document.querySelectorAll(`[data-extra-item][form="${formId(form)}"]`)].filter((input) => !input.disabled);

  // Phase de capture : passe avant le gestionnaire d'envoi de Dawn, qui lit ensuite le formulaire.
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.closest('product-form')) return;

      // Personnalisation : prénom obligatoire quand l'option est cochée
      const perso = document.querySelector(`anaphys-personalize[data-form-id="${formId(form)}"]`);
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
        // Les fichiers ne se recopient pas dans un champ caché : on renomme le champ fichier plus bas
        if (match && typeof value === 'string' && value !== '') add(`items[0][properties][${match[1]}]`, value);
      }
      const files = [...document.querySelectorAll(`input[type="file"][form="${formId(form)}"][name^="properties["]`)].filter(
        (input) => !input.disabled && input.files.length > 0
      );
      files.forEach((input) => {
        input.dataset.originalName = input.name;
        input.name = input.name.replace(/^properties\[/, 'items[0][properties][');
      });
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
        ...document.querySelectorAll(`[form="${formId(form)}"][name="quantity"], [form="${formId(form)}"][name^="properties["]`),
        ...extras,
      ].filter((input) => !input.disabled && !files.includes(input));
      originals.forEach((input) => (input.disabled = true));
      setTimeout(() => {
        added.forEach((input) => input.remove());
        originals.forEach((input) => (input.disabled = false));
        files.forEach((input) => (input.name = input.dataset.originalName));
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
        this.error = this.querySelector('[data-perso-error]');
        this.fields = [...this.querySelectorAll('[data-perso-field]')];
        this.picks = [...this.querySelectorAll('[data-perso-pick]')];
        this.addColor = this.querySelector('[data-perso-add-color]');
        this.file = this.querySelector('[data-perso-file]');
        this.fileName = this.querySelector('[data-perso-file-name]');
        this.fileRemove = this.querySelector('[data-perso-file-remove]');
        this.fileError = this.querySelector('[data-perso-file-error]');
        this.extra = this.querySelector('[data-extra-item]');
        this.maxBytes = (Number(this.dataset.maxSize) || 10) * 1024 * 1024;

        this.toggle.addEventListener('change', () => this.setActive(this.toggle.checked));
        this.name.addEventListener('input', () => {
          this.error.hidden = true;
          this.name.removeAttribute('aria-invalid');
          this.updateExtra();
        });

        // Teintes : jusqu'à trois, ajoutées à la demande
        this.addColor?.addEventListener('click', () => {
          const next = this.picks.find((pick) => pick.hidden);
          if (!next) return;
          next.hidden = false;
          const input = next.querySelector('[data-perso-color]');
          input.disabled = false;
          input.focus();
          this.updateAddColor();
        });
        this.picks.forEach((pick) =>
          pick.querySelector('[data-perso-pick-remove]').addEventListener('click', (event) => {
            event.preventDefault();
            pick.hidden = true;
            pick.querySelector('[data-perso-color]').disabled = true;
            this.updateAddColor();
            this.addColor?.focus();
          })
        );

        // Image d'inspiration
        this.file?.addEventListener('change', () => this.onFile());
        this.fileRemove?.addEventListener('click', () => {
          this.file.value = '';
          this.onFile();
          this.file.focus();
        });

        this.updateExtra();
      }

      get section() {
        return this.closest('section, .shopify-section') || document;
      }

      setActive(active) {
        this.panel.hidden = !active;
        [this.name, this.extra, this.file, ...this.fields].filter(Boolean).forEach((input) => (input.disabled = !active));
        this.picks.forEach((pick) => (pick.querySelector('[data-perso-color]').disabled = !active || pick.hidden));
        this.classList.toggle('is-active', active);
        // Le paiement express ne sait pas ajouter le supplément : on le cache pendant la personnalisation
        this.section.querySelectorAll('.shopify-payment-button').forEach((button) => (button.hidden = active));
        if (active) this.name.focus({ preventScroll: true });
      }

      updateAddColor() {
        if (this.addColor) this.addColor.hidden = this.picks.every((pick) => !pick.hidden);
      }

      onFile() {
        const file = this.file.files[0];
        this.fileError.hidden = true;
        if (file && file.size > this.maxBytes) {
          this.file.value = '';
          this.fileError.textContent = `Cette image est trop lourde (${this.dataset.maxSize || 10} Mo maximum).`;
          this.fileError.hidden = false;
        }
        const current = this.file.files[0];
        this.fileName.textContent = current ? current.name : 'Ajouter une image';
        this.fileRemove.hidden = !current;
        this.classList.toggle('has-file', Boolean(current));
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

      updateExtra() {
        // Le supplément garde la trace du soin et du prénom (visible dans la commande)
        const name = this.name.value.trim();
        this.extra.dataset.properties = JSON.stringify({
          Soin: this.dataset.productTitle,
          ...(name ? { Prénom: name } : {}),
        });
      }
    }
  );
}

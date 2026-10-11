/*
 * Diagnostic capillaire ANAPHYS
 * 1. Logique (sans DOM) : lecture des points, score par étape du rituel, choix des soins,
 *    raisons « pourquoi pour toi », résumé et classement des 5 soins. Testable seule (module.exports).
 * 2. Interface : un écran par question, progression, retour, transitions,
 *    mémorisation du résultat (localStorage) et ajout du rituel au panier en un appel.
 */
(function (root) {
  'use strict';

  /* ---------- 1. Logique ---------- */

  const STEPS = ['purifier', 'nettoyer', 'nourrir', 'reparer', 'fortifier'];
  const STEP_LABELS = {
    purifier: 'Purifier',
    nettoyer: 'Nettoyer',
    nourrir: 'Nourrir',
    reparer: 'Réparer',
    fortifier: 'Fortifier',
  };
  const ALWAYS = 'nettoyer';
  const MIN_PRODUCTS = 2;
  const MAX_PRODUCTS = 5;

  // Raisons par défaut quand aucune réponse n'en a donné pour une étape
  const DEFAULT_REASONS = {
    purifier: 'Pour repartir d’un cuir chevelu net, libéré des résidus.',
    nettoyer: 'La base de ton rituel : un lavage doux qui respecte ton cuir chevelu.',
    nourrir: 'Pour garder des longueurs douces et souples.',
    reparer: 'Pour redonner de la tenue à ta fibre.',
    fortifier: 'Pour prendre soin de tes racines par un massage régulier.',
  };

  const DEFAULT_FOCUS = {
    purifier: 'un cuir chevelu à purifier en douceur',
    nourrir: 'des longueurs qui ont soif de douceur',
    reparer: 'une fibre qui demande à être réparée',
    fortifier: 'des racines à fortifier',
  };

  const normalize = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();

  function stepKey(name) {
    const value = normalize(name);
    if (value.startsWith('purif')) return 'purifier';
    if (value.startsWith('nettoy')) return 'nettoyer';
    if (value.startsWith('nourri')) return 'nourrir';
    if (value.startsWith('repar')) return 'reparer';
    if (value.startsWith('fortif')) return 'fortifier';
    if (value === 'max') return 'max';
    if (value === 'min') return 'min';
    return null;
  }

  // « Purifier:2, Nourrir:1, Max:3 » -> [{ key: 'purifier', value: 2 }, …]
  function parsePoints(text) {
    const entries = [];
    String(text || '')
      .split(/[,;]/)
      .forEach((part) => {
        const match = part.match(/^\s*([^:]+?)\s*:\s*(-?\d+)\s*$/);
        if (!match) return;
        const key = stepKey(match[1]);
        if (key) entries.push({ key, value: parseInt(match[2], 10) });
      });
    return entries;
  }

  const byRitualOrder = (a, b) => STEPS.indexOf(a) - STEPS.indexOf(b);

  /**
   * questions : [{ id, options: [{ label, points, reason }] }]
   * answers   : { [questionId]: indexDeLaRéponse }
   * Retourne { scores, steps (ordre du rituel), reasons: { step: [texte] }, limit, minimum }
   */
  function computeResult(questions, answers, options) {
    const threshold = (options && options.threshold) || 3;
    const scores = {};
    const contributions = {};
    STEPS.forEach((step) => {
      scores[step] = 0;
      contributions[step] = [];
    });
    let limit = MAX_PRODUCTS;
    let minimum = MIN_PRODUCTS;

    (questions || []).forEach((question, order) => {
      const index = answers ? answers[question.id] : undefined;
      if (index === undefined || index === null) return;
      const option = question.options && question.options[index];
      if (!option) return;

      let primary = null;
      parsePoints(option.points).forEach(({ key, value }) => {
        if (key === 'max') {
          limit = value;
          return;
        }
        if (key === 'min') {
          minimum = value;
          return;
        }
        scores[key] += value;
        if (!primary && value > 0) primary = { key, value };
      });
      // La raison va à la première étape listée dans les points de la réponse
      if (primary && option.reason) {
        contributions[primary.key].push({ text: option.reason, weight: primary.value, order });
      }
    });

    limit = Math.min(MAX_PRODUCTS, Math.max(MIN_PRODUCTS, limit || MAX_PRODUCTS));
    minimum = Math.min(limit, Math.max(MIN_PRODUCTS, minimum || MIN_PRODUCTS));

    const byScore = (a, b) => scores[b] - scores[a] || byRitualOrder(a, b);
    const others = STEPS.filter((step) => step !== ALWAYS);
    let picked = others.filter((step) => scores[step] >= threshold).sort(byScore);

    // Toujours au moins 2 soins : le shampooing + l'étape la plus utile
    if (picked.length === 0) {
      const best = others.slice().sort(byScore)[0];
      picked = [scores[best] > 0 ? best : 'nourrir'];
    }
    // « Min:N » (ex. rituel complet) : on complète avec les étapes les mieux notées
    others
      .filter((step) => !picked.includes(step))
      .sort(byScore)
      .forEach((step) => {
        if (picked.length < minimum - 1) picked.push(step);
      });
    picked = picked.slice(0, limit - 1);

    const steps = [ALWAYS].concat(picked).sort(byRitualOrder);

    const reasons = {};
    steps.forEach((step) => {
      const seen = new Set();
      const list = contributions[step]
        .slice()
        .sort((a, b) => b.weight - a.weight || a.order - b.order)
        .filter((item) => {
          if (seen.has(item.text)) return false;
          seen.add(item.text);
          return true;
        })
        .slice(0, 2)
        .map((item) => item.text);
      reasons[step] = list.length ? list : [DEFAULT_REASONS[step]];
    });

    return { scores, steps, reasons, limit, minimum, threshold };
  }

  const NUMBER_WORDS = { 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq' };

  // Résumé de 2 à 3 phrases, à partir des étapes les plus marquées
  function buildSummary(result, focusPhrases) {
    const phrases = Object.assign({}, DEFAULT_FOCUS, focusPhrases || {});
    const ranked = result.steps
      .filter((step) => step !== ALWAYS && phrases[step])
      .sort((a, b) => result.scores[b] - result.scores[a] || byRitualOrder(a, b));
    // On ne met en avant que les besoins vraiment marqués (au moins le seuil)
    const strong = ranked.filter((step) => result.scores[step] >= (result.threshold || 3));
    const focus = (strong.length ? strong : ranked.slice(0, 1)).slice(0, 2).map((step) => phrases[step]);

    const sentences = [];
    if (focus.length === 2) sentences.push(`Tes réponses mettent en avant ${focus[0]} et ${focus[1]}.`);
    else if (focus.length === 1) sentences.push(`Tes réponses mettent en avant ${focus[0]}.`);

    const count = result.steps.length;
    if (count <= 2) {
      sentences.push('On est allé à l’essentiel : un rituel simple, facile à glisser dans ta routine.');
    } else if (count >= STEPS.length) {
      sentences.push('On te propose le rituel complet, du cuir chevelu jusqu’aux pointes.');
    } else {
      sentences.push(`On te propose ${NUMBER_WORDS[count]} soins, à utiliser dans l’ordre du rituel.`);
    }
    sentences.push('Pour chacun, tu trouveras juste en dessous pourquoi il est fait pour toi.');
    return sentences.join(' ');
  }

  /*
   * Classement des 5 étapes, par score réel (Nettoyer compris : il est toujours dans
   * le rituel, mais classé selon ses vrais points). Égalité : ordre du rituel.
   * - fill : longueur de la jauge, relative au n°1 (1 = pleine), minimum 0,15.
   * - level : mot affiché à la place d'un chiffre, selon la part du score du n°1.
   */
  const RANK_MIN_FILL = 0.15;
  const RANK_LEVELS = [
    { min: 0.75, label: 'Indispensable' },
    { min: 0.45, label: 'Très adapté' },
    { min: 0.2, label: 'Adapté' },
    { min: -Infinity, label: 'En bonus' },
  ];

  function computeRanking(result) {
    const threshold = result.threshold || 3;
    const scores = result.scores || {};
    const ordered = STEPS.slice().sort((a, b) => (scores[b] || 0) - (scores[a] || 0) || byRitualOrder(a, b));
    const top = Math.max(0, scores[ordered[0]] || 0);

    return ordered.map((step, index) => {
      const score = scores[step] || 0;
      const ratio = top > 0 ? Math.max(0, score) / top : 0;
      let level = score > 0 ? RANK_LEVELS.find((item) => ratio >= item.min).label : 'En bonus';
      // « Indispensable » seulement si le besoin est vraiment marqué
      if (level === 'Indispensable' && score < threshold) level = 'Très adapté';
      return {
        step,
        rank: index + 1,
        score,
        fill: Math.max(RANK_MIN_FILL, Math.min(1, ratio)),
        level,
        inRitual: (result.steps || []).includes(step),
      };
    });
  }

  const logic = { STEPS, STEP_LABELS, parsePoints, stepKey, computeResult, buildSummary, computeRanking };
  root.AnaphysQuizLogic = logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;

  /* ---------- 2. Interface ---------- */

  if (typeof window === 'undefined' || typeof customElements === 'undefined') return;
  if (customElements.get('anaphys-quiz')) return;

  const STORAGE_KEY = 'anaphys-quiz-v1';
  const storage = {
    get() {
      try {
        const value = localStorage.getItem(STORAGE_KEY);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        return null;
      }
    },
    set(value) {
      try {
        if (value === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch (error) {
        /* stockage indisponible (navigation privée…) : le quiz fonctionne quand même */
      }
    },
  };

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function readJSON(element, fallback) {
    if (!element) return fallback;
    try {
      return JSON.parse(element.textContent);
    } catch (error) {
      return fallback;
    }
  }

  // Formatage d'un prix en centimes selon le format de la boutique
  function formatMoney(cents, format) {
    const value = Number(cents) || 0;
    const template = format || '{{amount_with_comma_separator}} €';
    const group = (number, decimals, thousands, decimal) => {
      const [whole, fraction] = (number / 100).toFixed(decimals).split('.');
      const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      return fraction ? grouped + decimal + fraction : grouped;
    };
    return template.replace(/\{\{\s*(\w+)\s*\}\}/, (match, key) => {
      switch (key) {
        case 'amount':
          return group(value, 2, ',', '.');
        case 'amount_no_decimals':
          return group(value, 0, ',', '.');
        case 'amount_with_comma_separator':
          return group(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator':
          return group(value, 0, '.', ',');
        case 'amount_with_apostrophe_separator':
          return group(value, 2, "'", '.');
        case 'amount_with_space_separator':
          return group(value, 2, ' ', ',');
        default:
          return group(value, 2, '.', ',');
      }
    });
  }

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  class AnaphysQuiz extends HTMLElement {
    connectedCallback() {
      if (this.initialized) return;
      this.initialized = true;

      this.screens = Array.from(this.querySelectorAll('[data-quiz-screen]'));
      this.introScreen = this.querySelector('[data-quiz-screen="intro"]');
      this.resultScreen = this.querySelector('[data-quiz-screen="result"]');
      this.questionScreens = this.screens.filter((screen) => screen.dataset.quizScreen === 'question');
      this.questions = this.questionScreens.map((screen) => ({
        id: screen.dataset.questionId,
        kind: screen.dataset.kind,
        options: Array.from(screen.querySelectorAll('[data-quiz-option]')).map((button) => ({
          label: button.dataset.label,
          points: button.dataset.points,
          reason: button.dataset.reason,
        })),
      }));
      this.total = this.questionScreens.length;

      this.settings = readJSON(this.querySelector('[data-quiz-settings]'), {});
      this.products = readJSON(this.querySelector('[data-quiz-products-data]'), []);

      this.top = this.querySelector('[data-quiz-top]');
      this.progress = this.querySelector('[data-quiz-progress]');
      this.bar = this.querySelector('[data-quiz-bar]');
      this.indexLabel = this.querySelector('[data-quiz-index]');
      this.live = this.querySelector('[data-quiz-live]');
      this.addButton = this.querySelector('[data-quiz-add]');
      this.status = this.querySelector('[data-quiz-status]');

      this.answers = {};
      this.name = '';
      this.current = -1; // -1 : accueil, 0…n-1 : questions, n : résultat
      this.recommended = [];

      this.bindEvents();
      this.restore();
    }

    bindEvents() {
      this.querySelector('[data-quiz-start]')?.addEventListener('click', () => this.goTo(0));
      this.querySelector('[data-quiz-back]')?.addEventListener('click', () => this.goTo(this.current - 1, true));
      this.querySelector('[data-quiz-restart]')?.addEventListener('click', () => this.restart());
      this.addButton?.addEventListener('click', () => this.addRitual());

      this.querySelectorAll('[data-quiz-name-form]').forEach((form) => {
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const input = form.querySelector('[data-quiz-name]');
          this.name = (input ? input.value : '').trim().slice(0, 40);
          this.next();
        });
        form.querySelector('[data-quiz-skip]')?.addEventListener('click', () => {
          this.name = '';
          const input = form.querySelector('[data-quiz-name]');
          if (input) input.value = '';
          this.next();
        });
      });

      this.questionScreens.forEach((screen, screenIndex) => {
        const buttons = Array.from(screen.querySelectorAll('[data-quiz-option]'));
        buttons.forEach((button, optionIndex) => {
          button.addEventListener('click', () => this.choose(screenIndex, optionIndex));
        });
        // Flèches pour passer d'une réponse à l'autre
        screen.querySelector('[data-quiz-options]')?.addEventListener('keydown', (event) => {
          const position = buttons.indexOf(document.activeElement);
          if (position === -1) return;
          let target = null;
          if (event.key === 'ArrowDown' || event.key === 'ArrowRight') target = buttons[(position + 1) % buttons.length];
          if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
            target = buttons[(position - 1 + buttons.length) % buttons.length];
          if (event.key === 'Home') target = buttons[0];
          if (event.key === 'End') target = buttons[buttons.length - 1];
          if (target) {
            event.preventDefault();
            target.focus();
          }
        });
      });

      // Éditeur de thème : afficher la question sélectionnée
      if (window.Shopify && window.Shopify.designMode) {
        document.addEventListener('shopify:block:select', (event) => {
          const index = this.questionScreens.indexOf(event.target);
          if (index !== -1) this.goTo(index, false, { focus: false });
        });
      }
    }

    restore() {
      const saved = storage.get();
      if (!saved || !saved.answers || Object.keys(saved.answers).length === 0) return;
      if (window.Shopify && window.Shopify.designMode) return;
      this.answers = saved.answers;
      this.name = saved.name || '';
      this.syncSelections();
      this.showResult({ returning: true, focus: false });
    }

    syncSelections() {
      this.questionScreens.forEach((screen, screenIndex) => {
        const chosen = this.answers[this.questions[screenIndex].id];
        screen.querySelectorAll('[data-quiz-option]').forEach((button, optionIndex) => {
          button.setAttribute('aria-pressed', String(optionIndex === chosen));
        });
        const input = screen.querySelector('[data-quiz-name]');
        if (input) input.value = this.name;
      });
    }

    choose(screenIndex, optionIndex) {
      if (this.locked) return;
      const question = this.questions[screenIndex];
      this.answers[question.id] = optionIndex;
      this.questionScreens[screenIndex].querySelectorAll('[data-quiz-option]').forEach((button, index) => {
        button.setAttribute('aria-pressed', String(index === optionIndex));
      });
      // Laisse voir la sélection une fraction de seconde, puis avance
      this.locked = true;
      setTimeout(
        () => {
          this.locked = false;
          this.next();
        },
        reducedMotion() ? 120 : 280
      );
    }

    next() {
      if (this.current + 1 >= this.total) this.showResult({ returning: false, focus: true });
      else this.goTo(this.current + 1);
    }

    goTo(index, backwards = false, options = {}) {
      const focus = options.focus !== false;
      let target;
      if (index < 0) {
        index = -1;
        target = this.introScreen;
      } else if (index >= this.total) {
        index = this.total;
        target = this.resultScreen;
      } else {
        target = this.questionScreens[index];
      }
      if (!target) return;
      this.current = index;

      this.screens.forEach((screen) => {
        const active = screen === target;
        screen.hidden = !active;
        screen.classList.toggle('is-active', active);
        screen.classList.remove('is-entering', 'is-back');
      });
      if (!reducedMotion()) {
        void target.offsetWidth; // relance l'animation d'entrée
        target.classList.add('is-entering');
        if (backwards) target.classList.add('is-back');
      }

      const inQuestions = index >= 0 && index < this.total;
      if (this.top) this.top.hidden = !inQuestions;
      this.classList.toggle('is-result', index === this.total);

      if (inQuestions) {
        const step = index + 1;
        if (this.bar) this.bar.style.transform = `scaleX(${step / this.total})`;
        if (this.progress) {
          this.progress.setAttribute('aria-valuenow', String(step));
          this.progress.setAttribute('aria-valuetext', `Question ${step} sur ${this.total}`);
        }
        if (this.indexLabel) this.indexLabel.textContent = String(step);
        this.announce(`Question ${step} sur ${this.total}`);
      } else if (index === this.total) {
        this.announce('Ton rituel est prêt.');
      } else {
        this.announce('');
      }

      if (focus) {
        const heading = target.querySelector('[data-quiz-heading]');
        if (heading) heading.focus({ preventScroll: true });
        const top = this.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.5) {
          this.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
        }
      }
    }

    announce(message) {
      if (!this.live) return;
      this.live.textContent = '';
      if (message) setTimeout(() => (this.live.textContent = message), 60);
    }

    productFor(step) {
      const list = this.products.filter((product) => product.step === step);
      return list.find((product) => product.available) || list[0] || null;
    }

    showResult({ returning, focus }) {
      const result = computeResult(this.questions, this.answers, { threshold: this.settings.threshold });
      this.result = result;

      const title = this.querySelector('[data-quiz-result-title]');
      const base = this.settings.resultHeading || 'Ton rituel';
      if (title) title.textContent = this.name ? `${base}, ${this.name}` : base;

      const summary = this.querySelector('[data-quiz-summary]');
      if (summary) summary.textContent = buildSummary(result, this.settings.focus);

      const returningLabel = this.querySelector('[data-quiz-returning]');
      if (returningLabel) returningLabel.hidden = !returning;

      this.renderProducts(result);
      this.renderRanking(result);
      this.resetAddButton();

      storage.set({
        version: 1,
        name: this.name,
        answers: this.answers,
        steps: result.steps,
        savedAt: new Date().toISOString(),
      });

      this.goTo(this.total, false, { focus });
    }

    renderProducts(result) {
      const list = this.querySelector('[data-quiz-products]');
      const empty = this.querySelector('[data-quiz-empty]');
      this.recommended = result.steps.map((step) => this.productFor(step)).filter(Boolean);

      const cards = this.recommended.map((product) => {
        const index = STEPS.indexOf(product.step) + 1;
        const item = element('li', 'anaphys-quiz__product');

        const media = element('a', 'anaphys-quiz__product-media');
        media.href = product.url;
        media.tabIndex = -1;
        media.setAttribute('aria-hidden', 'true');
        if (product.image) {
          const image = document.createElement('img');
          image.src = product.image;
          image.alt = '';
          image.width = 600;
          image.height = 600;
          image.loading = 'lazy';
          media.appendChild(image);
        }

        const body = element('div', 'anaphys-quiz__product-body');
        const stepLabel = element('p', 'anaphys-quiz__product-step');
        stepLabel.append(element('span', 'anaphys-quiz__product-index', String(index)));
        stepLabel.append(document.createTextNode(product.stepLabel || STEP_LABELS[product.step]));
        body.append(stepLabel);

        const titleLink = element('a', 'anaphys-quiz__product-title', product.title);
        titleLink.href = product.url;
        const heading = element('h3', 'anaphys-quiz__product-heading');
        heading.append(titleLink);
        body.append(heading);

        if (product.hook) body.append(element('p', 'anaphys-quiz__product-hook', product.hook));

        const why = element('div', 'anaphys-quiz__why');
        why.append(element('p', 'anaphys-quiz__why-label', 'Pourquoi pour toi'));
        const reasons = element('ul', 'anaphys-quiz__why-list list-unstyled');
        reasons.setAttribute('role', 'list');
        (result.reasons[product.step] || []).forEach((reason) => reasons.append(element('li', '', reason)));
        why.append(reasons);
        body.append(why);

        const footer = element('div', 'anaphys-quiz__product-footer');
        footer.append(element('span', 'anaphys-quiz__product-price', product.priceFormatted));
        if (!product.available) footer.append(element('span', 'anaphys-quiz__product-soldout', 'Bientôt de retour'));
        const link = element('a', 'anaphys-quiz__product-link', 'Voir le soin');
        link.href = product.url;
        link.append(element('span', 'visually-hidden', ` : ${product.title}`));
        footer.append(link);
        body.append(footer);

        item.append(media, body);
        return item;
      });

      if (list) {
        list.replaceChildren(...cards);
        list.dataset.count = String(cards.length);
      }
      if (empty) empty.hidden = cards.length > 0;
    }

    renderRanking(result) {
      const wrapper = this.querySelector('[data-quiz-ranking]');
      const list = this.querySelector('[data-quiz-ranking-list]');
      if (!wrapper || !list) return;
      if (this.rankingObserver) this.rankingObserver.disconnect();
      list.classList.remove('is-revealed');

      const rows = computeRanking(result)
        .map((entry) => ({ entry, product: this.productFor(entry.step) }))
        .filter(({ product }) => product)
        .map(({ entry, product }, index) => {
          const item = element('li', 'anaphys-quiz__rank');
          item.classList.toggle('is-top', index === 0);
          item.classList.toggle('is-in-ritual', entry.inRitual);
          item.style.setProperty('--rank-fill', entry.fill.toFixed(3));
          item.style.setProperty('--rank-delay', `${index * 60}ms`);

          item.append(element('span', 'anaphys-quiz__rank-number', String(index + 1)));
          item.lastChild.setAttribute('aria-hidden', 'true');

          const thumb = element('span', 'anaphys-quiz__rank-thumb');
          if (product.image) {
            const image = document.createElement('img');
            image.src = product.image.replace(/([?&])width=\d+/, '$1width=160');
            image.alt = '';
            image.width = 80;
            image.height = 80;
            image.loading = 'lazy';
            thumb.append(image);
          }
          item.append(thumb);

          const main = element('div', 'anaphys-quiz__rank-main');
          const name = element('p', 'anaphys-quiz__rank-name');
          const link = element('a', 'anaphys-quiz__rank-title', product.title);
          link.href = product.url;
          name.append(link);
          name.append(element('span', 'anaphys-quiz__rank-step', product.stepLabel || STEP_LABELS[entry.step]));
          if (index === 0) name.append(element('span', 'anaphys-quiz__rank-pill', 'Ton n°1'));
          main.append(name);

          const meter = element('div', 'anaphys-quiz__rank-meter');
          const track = element('span', 'anaphys-quiz__rank-track');
          track.setAttribute('aria-hidden', 'true');
          track.append(element('span', 'anaphys-quiz__rank-bar'));
          const level = element('span', 'anaphys-quiz__rank-level');
          level.append(element('span', 'visually-hidden', 'Compatibilité : '));
          level.append(document.createTextNode(entry.level));
          meter.append(track, level);
          main.append(meter);
          item.append(main);

          const aside = element('div', 'anaphys-quiz__rank-aside');
          if (entry.inRitual) {
            aside.append(element('span', 'anaphys-quiz__rank-tag', 'Dans ton rituel'));
          } else if (product.available && product.variant) {
            const add = element('button', 'anaphys-quiz__rank-add', 'Ajouter');
            add.type = 'button';
            add.append(element('span', 'visually-hidden', ` ${product.title} au panier`));
            add.addEventListener('click', () => this.addSingle(product, add));
            aside.append(add);
          }
          item.append(aside);
          return item;
        });

      list.replaceChildren(...rows);
      wrapper.hidden = rows.length === 0;
      if (rows.length === 0) return;

      // Les jauges se remplissent quand le classement apparaît à l'écran
      const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => list.classList.add('is-revealed')));
      if (reducedMotion() || typeof IntersectionObserver === 'undefined') {
        list.classList.add('is-revealed');
        return;
      }
      this.rankingObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          this.rankingObserver.disconnect();
          reveal();
        },
        { threshold: 0.25 }
      );
      this.rankingObserver.observe(list);
    }

    async addSingle(product, button) {
      if (button.disabled) return;
      const label = button.firstChild;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        const opened = await this.postToCart([{ id: product.variant, quantity: 1 }]);
        if (!opened) return;
        button.removeAttribute('aria-busy');
        button.classList.add('is-added');
        label.textContent = 'Ajouté';
        if (this.status) this.status.textContent = `${product.title} est dans ton panier.`;
      } catch (error) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        if (this.status) this.status.textContent = this.errorMessage(error);
      }
    }

    // Ajout au panier en un appel ; ouvre le tiroir s'il existe, sinon va au panier.
    // Retourne true si le tiroir a été ouvert (on reste sur la page).
    async postToCart(items) {
      const routes = window.routes || {};
      const response = await fetch(`${routes.cart_add_url || '/cart/add'}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items,
          sections: ['cart-drawer', 'cart-icon-bubble'],
          sections_url: window.location.pathname,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.status) throw new Error(data.description || data.message || 'cart');

      if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'anaphys-quiz', cartData: data });
      }

      const drawer = document.querySelector('cart-drawer');
      if (drawer && typeof drawer.renderContents === 'function' && data.sections) {
        drawer.classList.remove('is-empty');
        drawer.renderContents(data);
        return true;
      }
      window.location.href = routes.cart_url || '/cart';
      return false;
    }

    errorMessage(error) {
      return error && error.message && error.message !== 'cart'
        ? error.message
        : 'Oups, l’ajout n’a pas fonctionné. Tu peux réessayer.';
    }

    resetAddButton() {
      if (!this.addButton) return;
      const addable = this.recommended.filter((product) => product.available && product.variant);
      this.addButton.hidden = addable.length === 0;
      this.addButton.disabled = false;
      this.addButton.removeAttribute('aria-busy');
      this.addButton.classList.remove('is-added');
      const label = this.addButton.querySelector('[data-quiz-add-label]');
      if (label) label.textContent = this.settings.addLabel || 'Ajouter mon rituel au panier';
      const total = this.addButton.querySelector('[data-quiz-total]');
      if (total) {
        const sum = addable.reduce((amount, product) => amount + (Number(product.price) || 0), 0);
        total.textContent = sum > 0 ? formatMoney(sum, this.settings.moneyFormat) : '';
      }
      if (this.status) this.status.textContent = '';
    }

    async addRitual() {
      const items = this.recommended
        .filter((product) => product.available && product.variant)
        .map((product) => ({ id: product.variant, quantity: 1 }));
      if (items.length === 0 || this.addButton.disabled) return;

      this.addButton.disabled = true;
      this.addButton.setAttribute('aria-busy', 'true');
      if (this.status) this.status.textContent = 'Ajout de ton rituel en cours…';

      try {
        const opened = await this.postToCart(items);
        if (!opened) return;
        this.addButton.removeAttribute('aria-busy');
        this.addButton.classList.add('is-added');
        const label = this.addButton.querySelector('[data-quiz-add-label]');
        if (label) label.textContent = 'Rituel ajouté';
        if (this.status) this.status.textContent = 'Ton rituel est dans ton panier.';
        this.addButton.disabled = false;
      } catch (error) {
        this.addButton.disabled = false;
        this.addButton.removeAttribute('aria-busy');
        if (this.status) this.status.textContent = this.errorMessage(error);
      }
    }

    restart() {
      storage.set(null);
      this.answers = {};
      this.name = '';
      this.recommended = [];
      this.syncSelections();
      this.goTo(0);
    }
  }

  customElements.define('anaphys-quiz', AnaphysQuiz);
})(typeof window !== 'undefined' ? window : globalThis);

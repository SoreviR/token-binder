// The public ranking page of a league (/l/<invite code>). It reads /api/v1/public/league and draws everything as text nodes
// (never parsed as HTML), so a player's login or card name can never inject markup. Images are only shown if they are https.
(function () {
  'use strict';

  /* ───── texts (English and Spanish, like the extension) ───── */
  const TEXTS = {
    en: {
      skip: 'Skip to content', players: '{0} players', onePlayer: '1 player', copy: 'Copy link', copied: 'Link copied', copyFail: 'Could not copy the link',
      season: 'Season {0}', endsIn: 'ends in {0} days', endsTomorrow: 'ends tomorrow', endsToday: 'ends today', seasonHint: 'Each month the ranking is archived and everyone\'s Elo goes halfway back to 1000.',
      ranking: 'Ranking', sortBy: 'Sort by', sortElo: 'Elo', sortWins: 'Wins', sortRate: 'Win %', record: '{0}W · {1}L', rate: '{0}% wins',
      level: 'Lv. {0}', busted: 'BUSTED', bustedTip: 'Flagged for an impossible save: shown last and hidden from the podium and the showcase.', crowns: '{0} seasons won',
      showcase: 'Showcase', showcaseHint: 'The card each player chose to show off.', value: '≈ €{0}',
      duels: 'Recent duels', noDuels: 'No duels yet. Challenge a friend from the League tab!', beatWord: 'beat', inRounds: 'in {0} rounds', filterOf: 'Duels of {0}', clear: 'Show all',
      today: 'Today', yesterday: 'Yesterday', lastSeason: 'Last season ({0})', noPlayers: 'Nobody has joined yet.',
      close: 'Close', empty: 'No cards in the showcase yet.',
      notFound: 'League not found', notFoundHint: 'Check the invite code in the address.', loadError: 'Could not load the league', retry: 'Try again',
      footer: 'Only GitHub logins, results and each player\'s showcase card are shown. The ranking is private to whoever has the invite code.',
      updated: 'Updated', podium: 'Podium', filterPlayer: 'Show the duels of {0}',
    },
    es: {
      skip: 'Saltar al contenido', players: '{0} jugadores', onePlayer: '1 jugador', copy: 'Copiar enlace', copied: 'Enlace copiado', copyFail: 'No se pudo copiar el enlace',
      season: 'Temporada {0}', endsIn: 'termina en {0} días', endsTomorrow: 'termina mañana', endsToday: 'termina hoy', seasonHint: 'Cada mes se archiva el ranking y el Elo de todos vuelve a medio camino de 1000.',
      ranking: 'Ranking', sortBy: 'Ordenar por', sortElo: 'Elo', sortWins: 'Victorias', sortRate: '% de victorias', record: '{0}V · {1}D', rate: '{0}% de victorias',
      level: 'Nv. {0}', busted: 'BUSTED', bustedTip: 'Marcado por una partida imposible: aparece al final y no entra en el podio ni en la vitrina.', crowns: '{0} temporadas ganadas',
      showcase: 'Vitrina', showcaseHint: 'La carta que cada jugador eligió para lucir.', value: '≈ {0} €',
      duels: 'Duelos recientes', noDuels: 'Aún no hay duelos. ¡Reta a un amigo desde la pestaña Liga!', beatWord: 'venció a', inRounds: 'en {0} rondas', filterOf: 'Duelos de {0}', clear: 'Ver todos',
      today: 'Hoy', yesterday: 'Ayer', lastSeason: 'Temporada pasada ({0})', noPlayers: 'Todavía no se ha unido nadie.',
      close: 'Cerrar', empty: 'Aún no hay cartas en la vitrina.',
      notFound: 'Liga no encontrada', notFoundHint: 'Revisa el código de invitación en la dirección.', loadError: 'No se pudo cargar la liga', retry: 'Reintentar',
      footer: 'Solo se muestran usuarios de GitHub, resultados y la carta de vitrina de cada jugador. El ranking es privado para quien tenga el código de invitación.',
      updated: 'Actualizado', podium: 'Podio', filterPlayer: 'Ver los duelos de {0}',
    },
  };
  const lang = (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  const t = (key, ...args) => (TEXTS[lang][key] ?? TEXTS.en[key] ?? key).replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m));
  document.documentElement.lang = lang;
  const skip = document.querySelector('.skip');
  if (skip) skip.textContent = t('skip');

  /* ───── small helpers ───── */
  const DAY = 864e5;
  const TIER_COLOR = ['--t0', '--t1', '--t2', '--t3', '--t4', '--t5', '--t6'];
  const TYPE_ICON = { Fire: '🔥', Water: '💧', Grass: '🍃', Lightning: '⚡', Psychic: '🔮', Fighting: '🥊', Darkness: '🌑', Metal: '⚙️', Dragon: '🐉', Fairy: '✨', Colorless: '⚪' };
  const MEDALS = ['🥇', '🥈', '🥉'];
  const app = document.getElementById('app');
  const code = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');

  /** Creates an element; `props.text` is set as textContent, `class` as the class name, `on*` as listeners, everything else as attributes. */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid) e.append(kid);
    return e;
  }
  const isHttps = u => typeof u === 'string' && /^https:\/\//.test(u);
  const tierVar = tier => 'var(' + (TIER_COLOR[Math.max(0, Math.min(6, Number(tier) || 0))]) + ')';

  /** A card image (or a letter when there is none). `size` is the TCGdex file: low or high. */
  function art(card, name, size) {
    const box = h('div', { class: 'art' });
    box.style.setProperty('--tc', tierVar(card && card.tier));
    if (card && isHttps(card.image)) box.append(h('img', { src: card.image + '/' + size + '.webp', alt: '', loading: 'lazy', decoding: 'async' }));
    else box.append(h('div', { class: 'letter', text: (name || '?').slice(0, 1).toUpperCase() }));
    return box;
  }

  const chip = (text, cls, title) => h('span', { class: 'chip' + (cls ? ' ' + cls : ''), text, title });
  const gradeChip = g => chip('TBGS ' + g, 'grade' + (g === 10 ? ' g10' : ''));
  const money = v => (lang === 'es' ? t('value', v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : t('value', v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  const rateOf = m => (m.wins + m.losses ? m.wins / (m.wins + m.losses) : 0);

  function memberChips(m) {
    const chips = [];
    if (m.fighter) {
      chips.push(chip(t('level', m.fighter.level)));
      if (m.fighter.grade) chips.push(gradeChip(m.fighter.grade));
      const icon = (m.fighter.types || []).map(x => TYPE_ICON[x]).filter(Boolean)[0];
      if (icon) chips.push(chip(icon, '', (m.fighter.types || []).join(' / ')));
    }
    if (m.crowns) chips.push(chip('🏆' + (m.crowns > 1 ? '×' + m.crowns : ''), 'crown', t('crowns', m.crowns)));
    if (m.busted) chips.push(chip(t('busted'), 'busted', t('bustedTip')));
    return chips.length ? h('div', { class: 'chips' }, chips) : null;
  }

  /* ───── state ───── */
  let data = null, lastJson = '', sort = 'elo', filter = null, toastTimer = 0, loadedAt = 0;

  /** The ranking in the chosen order; flagged (BUSTED) players always go last. */
  function ranked(members) {
    const key = { elo: m => m.elo, wins: m => m.wins, rate: m => rateOf(m) * 1000 + m.wins / 1000 }[sort];
    return [...members].sort((a, b) => (a.busted - b.busted) || (key(b) - key(a)) || (b.elo - a.elo) || a.login.localeCompare(b.login));
  }
  const podiumOf = members => [...members].filter(m => !m.busted).sort((a, b) => b.elo - a.elo || b.wins - a.wins || a.login.localeCompare(b.login)).slice(0, 3);

  /* ───── sections ───── */
  function toast(message) {
    document.querySelectorAll('.toast').forEach(x => x.remove());
    const node = h('div', { class: 'toast', role: 'status', text: message });
    document.body.append(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 2600);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); toast(t('copied')); }
    catch (e) { toast(t('copyFail')); }
  }

  function header(d) {
    const count = d.members.length;
    const parts = [h('div', {}, h('h1', { text: d.name }), h('div', { class: 'sub', text: count === 1 ? t('onePlayer') : t('players', count) })),
      h('button', { class: 'btn', type: 'button', text: '🔗 ' + t('copy'), onclick: copyLink })];
    const head = h('header', { class: 'head' }, parts);
    if (!d.season) return head;
    const start = Date.UTC(Number(d.season.id.slice(0, 4)), Number(d.season.id.slice(5, 7)) - 1, 1), end = new Date(d.season.endsAt).getTime();
    const left = Math.ceil((end - Date.now()) / DAY);
    const pct = Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
    const fill = h('i');
    fill.style.width = pct.toFixed(1) + '%';
    const bar = h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': t('season', d.season.id) }, fill);
    const when = left <= 0 ? t('endsToday') : left === 1 ? t('endsTomorrow') : t('endsIn', left);
    return h('div', {}, head, h('section', { class: 'panel season' }, h('div', { class: 'row' }, h('b', { text: t('season', d.season.id) }), h('span', { class: 'muted', text: when })), bar, h('div', { class: 'hint', text: t('seasonHint') })));
  }

  function podium(d) {
    const top = podiumOf(d.members);
    if (!top.length) return null;
    return h('section', { 'aria-label': t('podium') }, h('div', { class: 'podium' }, top.map((m, i) => {
      const pod = h('div', { class: 'pod p' + (i + 1), role: 'button', tabindex: '0', 'aria-label': t('filterPlayer', m.login), onclick: () => setFilter(m.login) },
        h('div', { class: 'medal', text: MEDALS[i] }),
        art(m.fighter, m.login, 'low'),
        h('div', { class: 'who', text: m.login }),
        h('div', { class: 'elo', text: String(m.elo) }),
        h('div', { class: 'rec', text: t('record', m.wins, m.losses) }));
      pod.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter(m.login); } });
      const chips = memberChips(m);
      if (chips) pod.append(chips);
      return pod;
    })));
  }

  function rankingSection(d) {
    const list = ranked(d.members);
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('sortBy') }, [['elo', 'sortElo'], ['wins', 'sortWins'], ['rate', 'sortRate']].map(([key, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(sort === key), text: t(label), onclick: () => { sort = key; render(); } })));
    const rows = list.map((m, i) => {
      const rate = rateOf(m);
      const fill = h('i');
      fill.style.width = (rate * 100).toFixed(0) + '%';
      const av = h('div', { class: 'av' });
      av.style.setProperty('--tc', tierVar(m.fighter && m.fighter.tier));
      if (m.fighter && isHttps(m.fighter.image)) av.append(h('img', { src: m.fighter.image + '/low.webp', alt: '', loading: 'lazy', decoding: 'async' }));
      else av.append(h('div', { class: 'letter', text: m.login.slice(0, 1).toUpperCase() }));
      return h('li', { class: 'prow' + (m.busted ? ' busted' : '') + (filter === m.login ? ' hl' : '') },
        h('div', { class: 'pos', text: String(i + 1) }), av,
        h('div', { class: 'who' },
          h('div', { class: 'name' }, h('button', { type: 'button', text: m.login, title: t('filterPlayer', m.login), onclick: () => setFilter(m.login) })),
          m.fighter ? h('div', { class: 'fight', text: m.fighter.name }) : null, memberChips(m)),
        h('div', { class: 'score' }, h('div', { class: 'elo', text: String(m.elo) }), h('div', { class: 'rec', text: t('record', m.wins, m.losses) }),
          h('div', { class: 'wbar', title: t('rate', Math.round(rate * 100)) }, fill)));
    });
    return h('section', {}, h('h2', { text: t('ranking') }), h('div', { class: 'tools' }, seg),
      h('div', { class: 'panel' }, rows.length ? h('ol', { class: 'rows' }, rows) : h('div', { class: 'empty', text: t('noPlayers') })));
  }

  /* the lightbox is a native <dialog>: it traps focus, closes on Esc and returns focus to what opened it */
  let dialog = null;
  function openCard(m) {
    const sc = m.showcase;
    if (!dialog) {
      dialog = h('dialog', { 'aria-label': t('showcase') });
      dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
      document.body.append(dialog);
    }
    const img = isHttps(sc.image) ? h('img', { src: sc.image + '/high.webp', alt: sc.name }) : h('div', { class: 'empty', text: sc.name });
    const chips = [];
    if (sc.grade) chips.push(gradeChip(sc.grade));
    if (sc.rarity) chips.push(chip(sc.rarity));
    if (sc.value !== undefined) chips.push(chip(money(sc.value)));
    dialog.replaceChildren(h('div', { class: 'lb' },
      h('button', { class: 'close', type: 'button', 'aria-label': t('close'), text: '✕', onclick: () => dialog.close() }), img,
      h('div', { class: 'meta' }, h('b', { text: sc.name }), h('div', { class: 'muted', text: m.login + (sc.set ? ' · ' + sc.set : '') }), chips.length ? h('div', { class: 'chips' }, chips) : null)));
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function showcaseSection(d) {
    const shown = d.members.filter(m => m.showcase);
    if (!shown.length) return null;
    return h('section', {}, h('h2', { text: t('showcase') }), h('div', { class: 'gallery' }, shown.map(m => {
      const sc = m.showcase;
      const card = h('button', { type: 'button', class: 'gcard' + (sc.grade ? ' graded' : '') + (sc.grade === 10 ? ' g10' : ''), 'aria-label': sc.name + ' — ' + m.login, onclick: () => openCard(m) },
        art(sc, sc.name, 'low'), h('div', { class: 'who', text: m.login }), h('div', { class: 'meta', text: sc.name + (sc.set ? ' · ' + sc.set : '') }));
      const chips = [];
      if (sc.grade) chips.push(gradeChip(sc.grade));
      if (sc.value !== undefined) chips.push(chip(money(sc.value)));
      if (chips.length) card.append(h('div', { class: 'chips' }, chips));
      return card;
    })));
  }

  function lastSeasonSection(d) {
    if (!d.podium || !d.podium.entries.length) return null;
    return h('section', {}, h('h2', { text: t('lastSeason', d.podium.season) }), h('div', { class: 'panel last' }, d.podium.entries.map(e =>
      h('div', { class: 'it' }, h('span', { text: MEDALS[e.rank - 1] + ' ' }), h('b', { text: e.login }), h('span', { class: 'muted', text: ' · Elo ' + e.elo + ' · ' + t('record', e.wins, e.losses) })))));
  }

  /** "Today", "Yesterday" or the date, by the viewer's local calendar day. */
  function dayLabel(date) {
    const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOf(new Date()) - startOf(date)) / DAY);
    return diff === 0 ? t('today') : diff === 1 ? t('yesterday') : date.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  function relative(date) {
    const secs = Math.round((date.getTime() - Date.now()) / 1000), rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    const abs = Math.abs(secs);
    if (abs < 60) return rtf.format(Math.round(secs), 'second');
    if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour');
    return rtf.format(Math.round(secs / 86400), 'day');
  }

  function duelsSection(d) {
    const duels = filter ? d.duels.filter(x => x.challenger === filter || x.defender === filter) : d.duels;
    const parts = [h('h2', { text: filter ? t('filterOf', filter) : t('duels') })];
    if (filter) parts.push(h('div', { class: 'filter' }, h('span', { text: filter }), h('button', { type: 'button', 'aria-label': t('clear'), title: t('clear'), text: '✕', onclick: () => setFilter(null) })));
    if (!duels.length) return h('section', {}, parts, h('div', { class: 'panel' }, h('div', { class: 'empty', text: t('noDuels') })));
    const box = h('div', { class: 'panel' });
    let day = '';
    for (const x of duels) {
      const date = new Date(x.at), label = dayLabel(date);
      if (label !== day) { day = label; box.append(h('div', { class: 'day', text: label })); }
      const loser = x.winner === x.challenger ? x.defender : x.challenger, gain = Math.abs(x.eloChange);
      const who = name => h('button', { type: 'button', class: 'pl', text: name, onclick: () => setFilter(name) });
      box.append(h('div', { class: 'duel' },
        h('div', { class: 'line' }, h('span', { class: 'win', text: x.winner }), h('span', { class: 'delta up', text: '+' + gain, title: 'Elo' }),
          h('span', { class: 'muted', text: ' ' + t('beatWord') + ' ' }), who(loser), h('span', { class: 'delta down', text: '−' + gain, title: 'Elo' }),
          h('span', { class: 'muted', text: ' ' + t('inRounds', x.rounds) })),
        h('time', { class: 'when', datetime: x.at, title: date.toLocaleString(lang), text: relative(date) })));
    }
    return h('section', {}, parts, box);
  }

  function setFilter(name) { filter = filter === name ? null : name; render(); const target = document.getElementById('duels'); if (name && target) target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }

  /* ───── page ───── */
  function render() {
    if (!data) return;
    document.title = data.name + ' · TokenBinder';
    const duels = duelsSection(data);
    const wrap = h('div', { id: 'duels' }, duels);
    app.replaceChildren(...[header(data), podium(data), rankingSection(data), showcaseSection(data), wrap, lastSeasonSection(data), h('footer', { text: t('footer') })].filter(Boolean));
    app.setAttribute('aria-busy', 'false');
  }

  function errorView(title, hint, retry) {
    app.replaceChildren(h('div', { class: 'errbox' }, h('h1', { text: title }), h('p', { class: 'muted', text: hint }), retry ? h('button', { class: 'btn primary', type: 'button', text: t('retry'), onclick: () => load(true) }) : null));
    app.setAttribute('aria-busy', 'false');
  }

  async function load(first) {
    try {
      const res = await fetch('/api/v1/public/league?code=' + encodeURIComponent(code));
      const json = await res.json();
      if (!json.ok) { if (first || !data) errorView(t('notFound'), t('notFoundHint'), false); return; }
      const text = JSON.stringify(json);
      loadedAt = Date.now();
      if (text !== lastJson) { lastJson = text; data = json; render(); }   // an unchanged refresh redraws nothing
    } catch (e) {
      if (first || !data) errorView(t('loadError'), '', true);
    }
  }

  load(true);
  setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - loadedAt > 55000) load(false); }, 15000);
})();

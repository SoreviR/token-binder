(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay');
  const TIERS = ['Común', 'Poco común', 'Rara', 'Holo', 'Ultra', 'Ilustración', 'Secreta'];
  const TCOLOR = ['--t0', '--t1', '--t2', '--t3', '--t4', '--t5', '--t6'];

  let S = null;            // último estado recibido
  let filter = null;       // categoría de rareza elegida en el álbum
  let viewing = null;      // id de la carta abierta en el visor
  let warned = 0;
  const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n * 100) / 100);

  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.style.cssText = v; // CSSOM: permitido por el CSP (setAttribute('style') no)
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid) e.append(kid);
    return e;
  }
  const row = (a, b) => el('div', { class: 'row' }, el('span', { text: a }), el('span', { text: b }));
  const box = (title, ...kids) => el('div', { class: 'card-box' }, title && el('h4', { text: title }), ...kids);
  const bar = (pct, cls) => el('div', { class: 'barwrap ' + (cls || '') }, el('i', { style: 'width:' + Math.max(0, Math.min(100, pct)).toFixed(1) + '%' }));
  const badge = t => el('span', { class: 'badge b' + t, text: TIERS[t] });
  const send = (type, extra) => vscode.postMessage(Object.assign({ type }, extra));

  /* ───── carta con inclinación 3D y brillo según la rareza ───── */
  function cardEl(c, width) {
    const face = c.src ? el('img', { src: c.src, alt: c.name, draggable: 'false' }) : el('div', { class: 'missing', text: c.name });
    const root = el('div', { class: 'card3d t' + c.tier, style: '--w:' + (width || 150) + 'px' },
      el('div', { class: 'inner' }, face, el('div', { class: 'foil' }), el('div', { class: 'glare' })));
    root.addEventListener('pointermove', e => {
      const r = root.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      root.style.setProperty('--rx', ((0.5 - y) * 20).toFixed(1) + 'deg');
      root.style.setProperty('--ry', ((x - 0.5) * 20).toFixed(1) + 'deg');
      root.style.setProperty('--mx', (x * 100).toFixed(0) + '%');
      root.style.setProperty('--my', (y * 100).toFixed(0) + '%');
      root.classList.add('active');
    });
    root.addEventListener('pointerleave', () => {
      for (const p of ['--rx', '--ry']) root.style.setProperty(p, '0deg');
      root.style.setProperty('--mx', '50%'); root.style.setProperty('--my', '50%');
      root.classList.remove('active');
    });
    return root;
  }

  const freeSlot = () => !!S && S.slots.some(s => s === null);

  /* ───── panel principal ───── */
  function render() {
    const d = S;
    const q = d.pct;
    const unit = d.unit === 'credits' ? ' créditos' : ' tokens';

    const openBtn = (kind, n, label) => el('button', { class: 'btn' + (kind === 'pack' ? '' : ' ghost'), ...(n ? {} : { disabled: '' }), text: label + ' (' + n + ')', onclick: () => send('openPack', { kind }) });
    const packBox = box('Sobres',
      el('div', { class: 'packrow' },
        el('div', { class: 'pack' }, el('div', { class: 'ball' }), el('b', { text: 'BOOSTER' })),
        el('div', { class: 'packinfo' },
          bar(d.nextPack.pct),
          el('div', { class: 'sub', text: fmt(d.nextPack.into) + ' / ' + fmt(d.nextPack.span) + ' tokens al próximo sobre gratis' }),
          el('div', { class: 'btns' }, openBtn('pack', d.packs, 'Sobre'), openBtn('premium', d.premium, 'Premium'), openBtn('ball', d.balls, 'Pokébola')))));

    const shopBox = box('Tienda',
      el('div', { class: 'row' }, el('b', { text: '🪙 ' + d.coins + ' monedas' }),
        el('span', { class: d.pace ? 'pace on' : 'pace', title: 'Ganas +20 % de monedas mientras tu uso del cupo vaya por debajo del ritmo del mes', text: d.pace ? '+20 % por ir bajo el ritmo' : 'sin bonus de ritmo' })),
      ...d.shop.map(i => el('div', { class: 'shopitem' },
        el('div', { class: 'si' }, el('div', { text: i.name }), el('div', { class: 'sub', text: i.desc })),
        el('button', { class: 'btn', ...(i.price !== null && d.coins >= i.price ? {} : { disabled: '' }), text: i.price === null ? 'Máximo' : '🪙 ' + i.price, onclick: () => send('buy', { item: i.id }) }))));

    const slots = d.slots.map(s => s ? slotView(s) : el('div', { class: 'empty-slot', text: d.albumUnique ? 'Hueco libre: abre una carta del álbum y pulsa «Entrenar».' : 'Abre tu primer sobre para conseguir cartas.' }));

    const max = Math.max(1, ...d.daily.map(x => d.unit === 'credits' ? x.credits : x.total));
    const chart = el('div', { class: 'chart' }, d.daily.map(x => {
      const v = d.unit === 'credits' ? x.credits : x.total;
      return el('div', { style: 'height:' + Math.max(2, (v / max) * 100) + '%', title: x.date + ': ' + fmt(v) });
    }));
    const list = arr => arr.length ? arr.map(m => row(m.name, fmt(m.total))) : [el('div', { class: 'sub', text: 'Sin datos todavía' })];

    app.replaceChildren(
      box('Cuota mensual', row(fmt(d.used) + unit, q.toFixed(1) + '% de ' + fmt(d.limit)),
        bar(q, q >= 100 ? 'err' : q >= 80 ? 'warn' : ''), row('Hoy', fmt(d.today.total)), row('Mes', fmt(d.month.total))),
      packBox,
      box('Entrenando (' + d.slots.filter(Boolean).length + '/' + d.slots.length + ')', ...slots),
      shopBox,
      albumView(),
      box('Por día (mes)', chart),
      box('Por modelo', ...list(d.byModel)),
      box('Por modo', ...list(d.byMode)));

    announce(d.events || []);
    if (q >= 80 && q < 100 && warned < 80) { warned = 80; toast('Cuidado: ' + q.toFixed(0) + '% del cupo mensual'); }
    if (q >= 100 && warned < 100) { warned = 100; toast('Cupo mensual agotado'); }
    if (q < 80) warned = 0;
  }

  function slotView(s) {
    const c = s.card;
    return el('div', { class: 'center' },
      cardEl(c, 150),
      el('div', { class: 'row', style: 'justify-content:center;margin-top:6px' }, el('b', { text: c.name }), badge(c.tier)),
      el('div', { class: 'sub', text: [c.stage, c.hp ? c.hp + ' PS' : '', c.set].filter(Boolean).join(' · ') }),
      bar(s.pct),
      el('div', { class: 'sub', text: fmt(s.into) + ' / ' + fmt(s.span) + ' tokens para evolucionar' + (s.evolved ? ' · evoluciones: ' + s.evolved : '') }));
  }

  function albumView() {
    const d = S;
    const chips = [el('button', { class: 'chip' + (filter === null ? ' on' : ''), text: 'Todas', onclick: () => { filter = null; render(); } })]
      .concat(TIERS.map((n, i) => el('button', { class: 'chip' + (filter === i ? ' on' : ''), text: n, onclick: () => { filter = i; render(); } })));
    const cards = d.album.filter(c => filter === null || c.tier === filter);
    const grid = cards.length ? el('div', { class: 'grid' }, cards.map(c => {
      const t = el('div', { class: 'thumb' + (d.trainingIds.includes(c.id) ? ' training' : ''), style: '--tc:var(' + TCOLOR[c.tier] + ')', title: c.name + ' · ' + c.rarity, onclick: () => openViewer(c.id) },
        c.src ? el('img', { src: c.src, alt: c.name, loading: 'lazy' }) : el('div', { class: 'nm', text: c.name }),
        c.count > 1 ? el('span', { class: 'n', text: '×' + c.count }) : null);
      return t;
    })) : el('div', { class: 'sub', text: d.albumUnique ? 'No tienes cartas de esta categoría.' : 'Tu álbum está vacío.' });
    return box('Álbum (' + d.albumUnique + ' distintas · ' + d.albumTotal + ' en total · ' + d.mastered + ' completadas)', el('div', { class: 'chips' }, chips), grid);
  }

  /* ───── visor de una carta ───── */
  function openViewer(id) {
    const c = S.album.find(x => x.id === id);
    if (!c) return;
    viewing = id;
    const training = S.trainingIds.includes(id);
    overlay.replaceChildren(...[
      cardEl(c, 220),
      el('div', { class: 'row', style: 'gap:8px;justify-content:center' }, el('b', { text: c.name }), badge(c.tier)),
      el('div', { class: 'sub', text: [c.rarity, c.stage, c.hp ? c.hp + ' PS' : '', c.set].filter(Boolean).join(' · ') }),
      c.count > 1 ? el('div', { class: 'sub', text: 'Tienes ' + c.count + ' copias' }) : null,
      el('div', { class: 'row', style: 'gap:8px' },
        el('button', { class: 'btn', ...(freeSlot() && !training ? {} : { disabled: '' }), text: training ? 'Entrenando' : freeSlot() ? 'Entrenar' : 'Sin huecos', onclick: () => { send('train', { id }); closeOverlay(); } }),
        el('button', { class: 'btn ghost', text: 'Cerrar', onclick: closeOverlay })),
    ].filter(Boolean)); // replaceChildren(null) insertaría el texto "null"
    send('high', { id });
  }
  function closeOverlay() { viewing = null; overlay.replaceChildren(); }

  /* ───── apertura de sobre ───── */
  function showOpening(kind) {
    overlay.replaceChildren(
      el('div', { class: 'hint', text: kind === 'ball' ? 'Lanzando Pokébola…' : 'Abriendo sobre…' }),
      el('div', { class: 'pack big shake' }, el('div', { class: 'ball' }), el('b', { text: 'BOOSTER' })));
  }

  function showReveal(cards) {
    let left = cards.length;
    const done = el('button', { class: 'btn', text: 'Listo', style: 'display:none', onclick: closeOverlay });
    const hint = el('div', { class: 'hint', text: 'Toca cada carta para darle la vuelta' });
    const cells = cards.map(c => {
      const cell = el('div', { class: 'cell' });
      const back = el('div', { class: 'back', style: '--w:130px', onclick: () => flip() }, el('div', { class: 'ball' }));
      function flip() {
        if (!back.isConnected) return;
        const face = cardEl(c, 130); face.classList.add('reveal-in');
        back.replaceWith(face);
        cell.append(
          el('div', { class: 'nm' }, el('b', { text: c.name }), document.createTextNode(' '), badge(c.tier), c.isNew ? el('span', { class: 'newtag', text: ' NUEVA' }) : null),
          freeSlot() ? el('button', { class: 'btn ghost', text: 'Entrenar', onclick: e => { send('train', { id: c.id }); e.target.disabled = true; e.target.textContent = 'Entrenando'; } }) : null);
        if (--left === 0) { hint.textContent = '¡Sobre completo!'; done.style.display = ''; }
      }
      cell._flip = flip;
      cell.append(back);
      return cell;
    });
    const all = el('button', { class: 'btn ghost', text: 'Revelar todas', onclick: () => cells.forEach(c => c._flip()) });
    overlay.replaceChildren(hint, el('div', { class: 'revgrid' }, cells), el('div', { class: 'row', style: 'gap:8px' }, all, done));
  }

  /* ───── avisos ───── */
  let toastTimer;
  function toast(text) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = el('div', { class: 'toast', text });
    document.body.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 4500);
  }
  function announce(events) {
    for (const e of events) {
      if (e.startsWith('packs:')) toast('¡Ganaste ' + e.slice(6) + (e === 'packs:1' ? ' sobre nuevo!' : ' sobres nuevos!'));
      else if (e === 'bonusPack') toast('Cupo al 100%: sobre de regalo');
      else if (e.startsWith('evolve:')) toast('¡Tu carta evolucionó a ' + e.slice(7) + '!');
      else if (e.startsWith('graduate:')) toast(e.slice(9) + ' completó su línea · +1 sobre');
    }
  }

  window.addEventListener('message', ev => {
    const m = ev.data || {};
    if (m.type === 'state') {
      S = m.data;
      render();
      if (viewing && !S.album.find(c => c.id === viewing)) closeOverlay();
    } else if (m.type === 'opening') showOpening(m.kind);
    else if (m.type === 'reveal') showReveal(m.cards);
    else if (m.type === 'openFailed') { closeOverlay(); toast('No se pudo abrir el sobre (sin conexión)'); }
    else if (m.type === 'high' && viewing === m.id) {
      const img = overlay.querySelector('.card3d img');
      if (img) img.src = m.src;
    }
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlay(); });
  vscode.postMessage({ type: 'ready' });
})();

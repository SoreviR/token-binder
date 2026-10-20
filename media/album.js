(function () {
  const vscode = acquireVsCodeApi();
  const { TIERS, TCOLOR, el, badge, cardEl } = window.PT;
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay');
  const send = (type, extra) => vscode.postMessage(Object.assign({ type }, extra));

  let D = null;            // { album, trainingIds, freeSlots, unique, total, mastered }
  let tier = null;         // categoría elegida
  let query = '';
  let sort = 'tier';
  let viewing = null;

  const SORTS = {
    tier: ['Rareza', (a, b) => b.tier - a.tier || a.name.localeCompare(b.name)],
    recent: ['Más recientes', (a, b) => b.firstAt - a.firstAt],
    name: ['Nombre', (a, b) => a.name.localeCompare(b.name)],
    count: ['Repetidas', (a, b) => b.count - a.count || b.tier - a.tier],
  };

  // Barra de herramientas: se crea una sola vez para no perder el foco al escribir.
  const title = el('h2', { text: 'Álbum' });
  const summary = el('div', { class: 'sub' });
  const search = el('input', { class: 'search', type: 'search', placeholder: 'Buscar por nombre o set…', oninput: e => { query = e.target.value.trim().toLowerCase(); renderGrid(); } });
  const sorter = el('select', { class: 'sorter', onchange: e => { sort = e.target.value; renderGrid(); } },
    Object.entries(SORTS).map(([k, [label]]) => el('option', { value: k, text: label })));
  const chips = el('div', { class: 'chips' });
  const grid = el('div', { class: 'agrid' });
  app.append(el('div', { class: 'albumhead' }, title, summary), el('div', { class: 'toolbar' }, search, sorter), chips, grid);

  function renderChips() {
    const counts = TIERS.map((_, i) => D.album.filter(c => c.tier === i).length);
    chips.replaceChildren(
      el('button', { class: 'chip' + (tier === null ? ' on' : ''), text: 'Todas (' + D.album.length + ')', onclick: () => { tier = null; renderChips(); renderGrid(); } }),
      ...TIERS.map((n, i) => el('button', { class: 'chip' + (tier === i ? ' on' : ''), style: counts[i] ? '' : 'opacity:.45', text: n + ' (' + counts[i] + ')', onclick: () => { tier = i; renderChips(); renderGrid(); } })));
  }

  function renderGrid() {
    if (!D) return;
    const cards = D.album
      .filter(c => (tier === null || c.tier === tier) && (!query || (c.name + ' ' + (c.set || '') + ' ' + c.rarity).toLowerCase().includes(query)))
      .sort(SORTS[sort][1]);
    if (!cards.length) {
      grid.replaceChildren(el('div', { class: 'sub', style: 'grid-column:1/-1', text: D.album.length ? 'Ninguna carta coincide con el filtro.' : 'Tu álbum está vacío: abre un sobre desde el panel lateral.' }));
      return;
    }
    grid.replaceChildren(...cards.map(c => el('div', { class: 'thumb' + (D.trainingIds.includes(c.id) ? ' training' : ''), style: '--tc:var(' + TCOLOR[c.tier] + ')', title: c.name + ' · ' + c.rarity, onclick: () => openViewer(c.id) },
      c.src ? el('img', { src: c.src, alt: c.name, loading: 'lazy' }) : el('div', { class: 'nm', text: c.name }),
      c.count > 1 ? el('span', { class: 'n', text: '×' + c.count }) : null,
      D.trainingIds.includes(c.id) ? el('span', { class: 'tr', text: 'Entrenando' }) : null)));
  }

  function render() {
    summary.textContent = D.unique + ' cartas distintas · ' + D.total + ' en total · ' + D.mastered + ' líneas completadas';
    renderChips();
    renderGrid();
    if (viewing && !D.album.find(c => c.id === viewing)) closeViewer();
  }

  /* ───── visor de una carta ───── */
  function openViewer(id) {
    const c = D.album.find(x => x.id === id);
    if (!c) return;
    viewing = id;
    const training = D.trainingIds.includes(id);
    const label = training ? 'Entrenando' : D.freeSlots ? 'Entrenar' : 'Sin huecos libres';
    overlay.replaceChildren(...[
      el('div', { class: 'viewer', onclick: e => e.stopPropagation() },
        cardEl(c, 300),
        el('div', { class: 'row', style: 'gap:8px;justify-content:center;margin-top:10px' }, el('b', { text: c.name }), badge(c.tier)),
        el('div', { class: 'sub center', text: [c.rarity, c.stage, c.hp ? c.hp + ' PS' : '', c.set].filter(Boolean).join(' · ') }),
        c.count > 1 ? el('div', { class: 'sub center', text: 'Tienes ' + c.count + ' copias' }) : null,
        el('div', { class: 'row', style: 'gap:8px;justify-content:center;margin-top:8px' },
          el('button', { class: 'btn', ...(D.freeSlots && !training ? {} : { disabled: '' }), text: label, onclick: () => { send('train', { id }); closeViewer(); } }),
          el('button', { class: 'btn ghost', text: 'Cerrar', onclick: closeViewer }))),
    ]);
    send('high', { id });
  }
  function closeViewer() { viewing = null; overlay.replaceChildren(); }
  overlay.addEventListener('click', closeViewer);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); });

  window.addEventListener('message', ev => {
    const m = ev.data || {};
    if (m.type === 'album') { D = m.data; render(); }
    else if (m.type === 'high' && viewing === m.id) {
      const img = overlay.querySelector('.card3d img');
      if (img) img.src = m.src;
    }
  });
  vscode.postMessage({ type: 'ready' });
})();

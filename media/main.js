(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');
  const EGG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><ellipse cx="16" cy="18" rx="9" ry="12" fill="#f4efe0" stroke="#8a7f66"/><path d="M9 16l3 2 3-3 3 3 3-2 2 2" fill="none" stroke="#c9a227" stroke-width="1.5"/></svg>');
  const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n * 100) / 100);

  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.style.cssText = v; // CSSOM: permitido por el CSP (setAttribute('style') no)
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid) e.append(kid);
    return e;
  }
  const row = (a, b) => el('div', { class: 'row' }, el('span', { text: a }), el('span', { text: b }));
  const card = (title, ...kids) => el('div', { class: 'card' }, title && el('h4', { text: title }), ...kids);

  let bubbleTimer;
  let prevStage = null, prevName = null;

  function render(d) {
    const p = d.pokemon;
    const evolved = prevName !== null && (prevName !== p.name);
    prevName = p.name; prevStage = p.stage;

    const img = el('img', { src: p.sprite || EGG, alt: p.name });
    if (evolved) img.classList.add('flash');
    const bubble = el('div', { class: 'bubble', id: 'bubble' });
    const pet = el('div', { class: 'pet' }, bubble, img,
      el('div', { class: 'name', text: p.name }),
      el('div', { class: 'sub' }, document.createTextNode(p.line.join(' → ')), p.shiny ? el('span', { class: 'shiny', text: ' ✦ shiny' }) : null),
      el('div', { class: 'sub', text: p.nature }),
      el('div', { class: 'barwrap' }, Object.assign(el('i'), { style: 'width:' + p.pct.toFixed(1) + '%' })),
      el('div', { class: 'sub', text: fmt(p.into) + ' / ' + fmt(p.span) + ' tokens a la siguiente etapa' }));
    pet.addEventListener('click', () => say('¡' + p.name + '!'));

    const q = d.pct;
    const quotaBar = el('div', { class: 'barwrap ' + (q >= 100 ? 'err' : q >= 80 ? 'warn' : '') },
      Object.assign(el('i'), { style: 'width:' + Math.min(100, q).toFixed(1) + '%' }));
    const unit = d.unit === 'credits' ? ' créditos' : ' tokens';

    const max = Math.max(1, ...d.daily.map(x => d.unit === 'credits' ? x.credits : x.total));
    const chart = el('div', { class: 'chart' }, d.daily.map(x => {
      const v = d.unit === 'credits' ? x.credits : x.total;
      return el('div', { style: 'height:' + Math.max(2, (v / max) * 100) + '%', title: x.date + ': ' + fmt(v) });
    }));

    const list = arr => arr.length ? arr.map(m => row(m.name, fmt(m.total))) : [el('div', { class: 'sub', text: 'Sin datos todavía' })];

    app.replaceChildren(
      card(null, pet),
      card('Cuota mensual', row(fmt(d.used) + unit, q.toFixed(1) + '% de ' + fmt(d.limit)), quotaBar,
        row('Hoy', fmt(d.today.total)), row('Mes', fmt(d.month.total))),
      card('Por día (mes)', chart),
      card('Por modelo', ...list(d.byModel)),
      card('Por modo', ...list(d.byMode)),
      card('Pokédex (' + d.dexCount + ')', d.dex.length
        ? el('div', { class: 'dex' }, d.dex.map(x => el('div', {}, el('img', { src: x.sprite || EGG, alt: x.name }), el('div', { text: x.name + (x.shiny ? ' ✦' : '') }))))
        : el('div', { class: 'sub', text: 'Aún no se ha graduado ninguno.' })));

    const msgs = { hatch: '¡El huevo eclosionó!', evolve: '¡Está evolucionando!', candy: '¡Cuota al 100%! Rare Candy 🍬' };
    for (const e of d.events) {
      if (msgs[e]) say(msgs[e]); else if (e.startsWith('graduate:')) say(e.slice(9) + ' se graduó a la Pokédex');
    }
    if (q >= 80 && !d.events.length) say(q >= 100 ? 'Cupo agotado' : 'Cuidado: ' + q.toFixed(0) + '% del cupo');
  }

  function say(text) {
    const b = document.getElementById('bubble');
    if (!b) return;
    b.textContent = text; b.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => b.classList.remove('show'), 4000);
  }

  window.addEventListener('message', ev => { if (ev.data && ev.data.type === 'state') render(ev.data.data); });
  vscode.postMessage({ type: 'ready' });
})();

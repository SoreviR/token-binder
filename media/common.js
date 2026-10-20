// Piezas compartidas por el panel lateral (main.js) y la pestaña del álbum (album.js).
window.PT = (function () {
  const TIERS = ['Común', 'Poco común', 'Rara', 'Holo', 'Ultra', 'Ilustración', 'Secreta'];
  const TCOLOR = ['--t0', '--t1', '--t2', '--t3', '--t4', '--t5', '--t6'];
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

  const badge = t => el('span', { class: 'badge b' + t, text: TIERS[t] });

  /** Carta con inclinación 3D que sigue al ratón y brillo holográfico según la rareza. */
  function cardEl(c, width) {
    const face = c.src ? el('img', { src: c.src, alt: c.name, draggable: 'false' }) : el('div', { class: 'missing', text: c.name });
    const root = el('div', { class: 'card3d t' + c.tier + (c.variant ? ' v-' + c.variant : ''), style: '--w:' + (width || 150) + 'px' },
      el('div', { class: 'inner' }, face, el('div', { class: 'foil' }), el('div', { class: 'glare' }), c.variant ? el('div', { class: 'vtag', text: c.variant === 'first' ? '1.ª ED.' : 'SHADOWLESS' }) : null));
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

  /** Hace que un elemento clicable también funcione con teclado (Tab, Enter, Espacio). */
  function press(node, fn, label) {
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', fn);
    node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } });
    return node;
  }

  /** Línea de datos de una carta: era, variante, rareza, etapa, PS y set. */
  const info = c => [c.era, c.variantLabel, c.rarity, c.stage, c.hp ? c.hp + ' PS' : '', c.set].filter(Boolean).join(' · ');

  /** «≈ 3 días» a partir de los tokens que faltan y el ritmo diario. Vacío si no hay ritmo. */
  function eta(remaining, perDay) {
    if (!(perDay > 0) || !(remaining > 0)) return '';
    const d = remaining / perDay;
    return d < 1 ? '≈ menos de 1 día' : d < 60 ? '≈ ' + (d < 10 ? d.toFixed(1) : Math.round(d)) + ' días' : '≈ ' + Math.round(d / 30) + ' meses';
  }

  return { TIERS, TCOLOR, fmt, el, badge, cardEl, press, info, eta };
})();

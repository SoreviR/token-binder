// The "Battle" tab of the album: your fighter, the gym ladder, the animated 1v1 arena and the result explained.
// The extension host simulates the fight and sends the whole log; this file only plays it back.
window.PTBattle = (function () {
  const { el, t, cardEl, marksEl, itemDesc } = window.PT;
  const FACTORS = ['level', 'demand', 'rarity', 'stage', 'grade', 'tokens'];
  const TYPE_ICON = { Fire: '🔥', Water: '💧', Grass: '🍃', Lightning: '⚡', Psychic: '🔮', Fighting: '🥊', Darkness: '🌑', Metal: '⚙️', Dragon: '🐉', Fairy: '✨', Colorless: '⚪' };
  const typeIcons = types => (types || []).map(x => TYPE_ICON[x] || '').join(' ');
  const pct = f => (f >= 1 ? '+' : '−') + Math.abs(Math.round((f - 1) * 100)) + '%';

  let root, stage, send, data = null;
  let timers = [];

  function init(host) { root = host.root; stage = host.stage; send = host.send; }
  function setData(d) { data = d; render(); }

  /* ───── the tab ───── */
  const box = (title, ...kids) => el('div', { class: 'bbox' }, title ? el('h3', { text: title }) : null, ...kids);
  const bar = (frac, cls) => el('div', { class: 'barwrap ' + (cls || '') }, el('i', { style: 'width:' + Math.max(0, Math.min(100, frac * 100)).toFixed(1) + '%' }));

  function recordBox(d) {
    const r = d.record;
    const medals = d.leaders.map(l => el('span', { class: 'medal' + (r.badges.includes(l.id) ? ' on' : ''), title: l.name, text: r.badges.includes(l.id) ? '🏅' : '○' }));
    return box(t('battle.title'),
      el('div', { class: 'row' }, el('b', { text: t('battle.record', r.wins, r.losses) }), el('span', { class: 'sub', text: t('battle.streak', r.streak, r.best) })),
      el('div', { class: 'medals' }, medals),
      el('div', { class: 'sub', text: t('battle.rewardsLeft', d.rewardsLeft) }));
  }

  function breakdown(f) {
    const rows = FACTORS.filter(k => Math.abs(f.strength[k] - 1) >= 0.0005)
      .map(k => el('div', { class: 'brow' }, el('span', { text: t('factor.' + k) }), el('b', { text: pct(f.strength[k]) })));
    return el('div', { class: 'breakdown' }, ...rows, el('div', { class: 'brow total' }, el('span', { text: t('factor.total') }), el('b', { text: '×' + f.strength.total.toFixed(2) })));
  }

  function fighterBox(d) {
    if (!d.fighter) {
      return box(t('battle.yourFighter'), el('div', { class: 'sub', text: t(d.fighterBlocked === 'grading' ? 'battle.grading' : d.fighterBlocked === 'soaked' ? 'battle.soaked' : 'battle.noFighter') }));
    }
    const f = d.fighter;
    return box(t('battle.yourFighter'),
      el('div', { class: 'fighterbox' },
        cardEl({ name: f.name, tier: f.tier, src: f.src, variant: f.variant, care: f.care, grade: f.grade }, 130),
        el('div', { class: 'fdetail' },
          el('div', { class: 'row', style: 'justify-content:flex-start;gap:8px' }, el('b', { text: f.name }), el('span', { class: 'sub', text: t('stats.level', f.level) + ' ' + typeIcons(f.types) })),
          marksEl(f),
          f.held ? el('div', { class: 'sub', text: itemDesc(f.held) }) : null,
          f.grade ? null : el('div', { class: 'sub', text: f.wearRisk > 0 ? t('battle.wearRisk', Math.round(f.wearRisk * 100)) : t('battle.noWearRisk') }),
          el('div', { class: 'sub', text: t('stats.hp') + ' ' + f.hp + ' · ' + t('stats.atk') + ' ' + Math.round(f.atk) }),
          breakdown(f),
          d.fighterTraining ? null : el('div', { class: 'sub warnline', text: t('battle.trainHint') }),
          el('div', { class: 'sub', text: t('battle.changeHint') }))));
  }

  function leaderRow(d, l) {
    const canFight = !!d.fighter && l.unlocked && !!l.card;
    const prev = d.leaders[d.leaders.findIndex(x => x.id === l.id) - 1];
    const note = !l.unlocked ? t('battle.locked', prev ? prev.name : '')
      : !l.card ? t('battle.downloading')
        : l.odds === undefined ? '' : t('battle.odds', Math.round(l.odds * 100));
    return el('div', { class: 'leader' + (l.earned ? ' earned' : '') + (l.unlocked ? '' : ' locked') },
      el('div', { class: 'lthumb' }, l.src ? el('img', { src: l.src, alt: '' }) : el('div', { class: 'nm', text: l.species })),
      el('div', { class: 'linfo' },
        el('div', { class: 'row', style: 'justify-content:flex-start;gap:8px' }, el('b', { text: l.name }), el('span', { class: 'sub', text: (l.earned ? '🏅 ' : '') + t('stats.level', l.level) + ' ' + typeIcons(l.types) })),
        el('div', { class: 'sub', text: (l.card || l.species) + ' · ' + t(l.earned ? 'battle.rematchReward' : 'battle.firstReward', l.earned ? l.rematch : l.reward) }),
        l.odds !== undefined && l.unlocked ? bar(l.odds, l.odds >= 0.5 ? '' : 'warn') : null,
        el('div', { class: 'sub' }, note, l.edge ? el('span', { class: 'edge ' + l.edge, text: ' ' + t(l.edge === 'me' ? 'battle.edgeMe' : 'battle.edgeFoe') }) : null)),
      el('button', { class: 'btn', ...(canFight ? {} : { disabled: '' }), text: t('battle.challenge'), onclick: () => send('startBattle', { leader: l.id }) }));
  }

  function ladderBox(d) { return box(t('battle.ladder'), ...d.leaders.map(l => leaderRow(d, l))); }

  /** Team Rocket shows up only while they hold one of your cards (stolen for going over the quota). */
  function rocketBox(d) {
    const r = d.rocket;
    if (!r) return null;
    return box(null, el('div', { class: 'leader rocket' },
      el('div', { class: 'lthumb' }, r.src ? el('img', { src: r.src, alt: '' }) : el('div', { class: 'nm', text: r.species })),
      el('div', { class: 'linfo' },
        el('div', { class: 'row', style: 'justify-content:flex-start;gap:8px' }, el('b', { text: t('rocket.title') }), el('span', { class: 'sub', text: t('stats.level', r.level) + ' ' + typeIcons(r.types) })),
        el('div', { class: 'sub', text: t('rocket.desc', r.stolen.join(', ')) }),
        r.odds !== undefined ? bar(r.odds, r.odds >= 0.5 ? '' : 'warn') : null,
        el('div', { class: 'sub', text: !r.card ? t('battle.downloading') : r.odds === undefined ? '' : t('battle.odds', Math.round(r.odds * 100)) })),
      el('button', { class: 'btn', ...(d.fighter && r.card ? {} : { disabled: '' }), text: t('rocket.challenge'), onclick: () => send('startBattle', { leader: r.id }) })));
  }

  function historyBox(d) {
    if (!d.history.length) { return box(t('battle.history'), el('div', { class: 'sub', text: t('battle.noHistory') })); }
    const names = Object.assign({ rocket: 'Team Rocket' }, Object.fromEntries(d.leaders.map(l => [l.id, l.name])));
    return box(t('battle.history'), ...d.history.slice(0, 10).map(h => el('div', { class: 'hrow ' + (h.won ? 'won' : 'lost') },
      el('span', { text: (h.won ? '✔ ' : '✘ ') + t('battle.historyRow', names[h.leader] || h.leader, h.card) }),
      el('span', { class: 'sub', text: t('battle.rounds', h.rounds) + (h.coins ? ' · 🪙 ' + h.coins : '') }))));
  }

  function render() {
    if (!data || !root) return;
    root.replaceChildren(...[recordBox(data), fighterBox(data), rocketBox(data), ladderBox(data), historyBox(data)].filter(Boolean));
  }

  /* ───── the arena ───── */
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function closeArena() { clearTimers(); stage.replaceChildren(); }

  function side(f, cls) {
    const hpText = el('span', { class: 'hptext', text: f.hp + ' / ' + f.hp });
    const hp = bar(1, 'big');
    const card = cardEl({ name: f.name, tier: f.tier, src: f.src, variant: f.variant, care: f.care, grade: f.grade }, 170);
    const wrap = el('div', { class: 'arena-side ' + cls }, el('div', { class: 'arena-card' }, card),
      el('div', { class: 'row' }, el('b', { text: f.name }), el('span', { class: 'sub', text: t('stats.level', f.level) + ' ' + typeIcons(f.types) })), hp, hpText);
    return { wrap, hp: hp.querySelector('i'), hpText, max: f.hp, card: wrap.querySelector('.arena-card') };
  }

  function play(r) {
    closeArena();
    const me = side(r.me, 'me'), foe = side(r.foe, 'foe');
    const logBox = el('div', { class: 'blog', 'aria-live': 'polite' });
    let speed = 1, i = 0, finished = false;
    const speedBtn = el('button', { class: 'btn ghost', text: '1×', onclick: () => { speed = speed === 1 ? 2 : 1; speedBtn.textContent = speed + '×'; } });
    const skipBtn = el('button', { class: 'btn ghost', text: t('battle.skip'), onclick: () => finish(true) });
    const resultBox = el('div', { class: 'bresult' });
    const arena = el('div', { class: 'arena' },
      el('div', { class: 'arena-title', text: t('battle.vs', r.leader.name, t('stats.level', r.leader.level)) }),
      el('div', { class: 'arena-fighters' }, foe.wrap, el('div', { class: 'vs', text: 'VS' }), me.wrap),
      logBox, el('div', { class: 'row', style: 'gap:8px;justify-content:center' }, speedBtn, skipBtn), resultBox);
    stage.replaceChildren(arena);
    skipBtn.focus();

    const by = s => (s === 'a' ? me : foe), nameOf = s => (s === 'a' ? r.me.name : r.foe.name);
    const setHp = (who, hp) => { who.hp.style.width = Math.max(0, hp / who.max * 100).toFixed(1) + '%'; who.hpText.textContent = Math.max(0, hp) + ' / ' + who.max; };
    const line = (text, cls) => { logBox.append(el('div', { class: 'logline ' + (cls || ''), text })); while (logBox.children.length > 7) logBox.firstChild.remove(); logBox.scrollTop = logBox.scrollHeight; };

    function applyAttack(ev, animate) {
      const attacker = by(ev.side), target = by(ev.side === 'a' ? 'b' : 'a');
      setHp(me, ev.hp.a); setHp(foe, ev.hp.b);
      if (animate) {
        attacker.card.classList.add('lunge'); timers.push(setTimeout(() => attacker.card.classList.remove('lunge'), 350 / speed));
        if (ev.dmg > 0) { target.card.classList.add('hit'); timers.push(setTimeout(() => target.card.classList.remove('hit'), 350 / speed)); }
        const pop = el('div', { class: 'dmg' + (ev.crit ? ' crit' : '') + (ev.miss ? ' miss' : ''), text: ev.miss ? t('battle.missShort') : '−' + ev.dmg });
        target.card.append(pop); timers.push(setTimeout(() => pop.remove(), 900 / speed));
      }
      line(ev.miss ? t('battle.miss', nameOf(ev.side), ev.move) : t('battle.used', nameOf(ev.side), ev.move, ev.dmg), ev.side === 'a' ? 'mine' : 'theirs');
      if (!ev.miss && ev.crit) line(t('battle.crit'), 'note');
      if (!ev.miss && ev.eff) line(t(ev.eff === 'weak' ? 'battle.superEffective' : 'battle.notVery'), 'note');
    }

    function finish(skipped) {
      if (finished) return;
      finished = true; clearTimers();
      if (skipped) { for (; i < r.log.length; i++) { const ev = r.log[i]; if (ev.t === 'attack') applyAttack(ev, false); } }
      setHp(me, r.log[r.log.length - 1].hp.a); setHp(foe, r.log[r.log.length - 1].hp.b);
      (r.won ? foe : me).card.classList.add('fainted');
      speedBtn.remove(); skipBtn.remove();
      resultBox.replaceChildren(...result(r));
      resultBox.querySelector('.btn')?.focus();
    }

    function next() {
      if (finished) return;
      if (i >= r.log.length) return finish(false);
      const ev = r.log[i++];
      if (ev.t === 'attack') { applyAttack(ev, true); timers.push(setTimeout(next, 900 / speed)); }
      else if (ev.t === 'end') finish(false);
      else next();
    }
    timers.push(setTimeout(next, 600));
  }

  /** Victory / defeat banner, the reward and a short explanation of why it went that way. */
  function result(r) {
    const why = [];
    for (const g of r.gaps) {
      const f = g.ratio;   // you / rival
      why.push(el('li', { text: t(f > 1 ? 'battle.whyFor' : 'battle.whyAgainst', t('factor.' + g.factor), Math.abs(Math.round((f - 1) * 100))) }));
    }
    if (r.typeEdge) why.push(el('li', { text: t(r.typeEdge === 'me' ? 'battle.whyTypeMe' : 'battle.whyTypeFoe') }));
    const odds = Math.round(r.odds * 100);
    if (r.won && r.odds < 0.4) why.push(el('li', { text: t('battle.whyUpset', odds) }));
    if (!r.won && r.odds > 0.6) why.push(el('li', { text: t('battle.whyUnlucky', odds) }));
    if (!why.length) why.push(el('li', { text: t('battle.whyEven') }));
    const o = r.outcome;
    const lines = [];
    if (o.coins) lines.push(el('div', { class: 'reward', text: t('battle.reward', o.coins) }));
    if (o.firstWin) lines.push(el('div', { class: 'reward', text: t('battle.badgeEarned', r.leader.name) }));
    if (o.xp) lines.push(el('div', { class: 'reward xp', text: t('battle.xp', o.xp.toLocaleString()) + (o.levelUp ? ' · ' + t('battle.levelUp', r.me.name, o.levelUp) : '') }));
    if (o.recovered) lines.push(el('div', { class: 'reward', text: t('battle.recovered', o.recovered) }));
    if (r.duel) lines.push(el('div', { class: 'reward', text: t('battle.elo', o.eloChange > 0 ? '+' + o.eloChange : String(o.eloChange), r.duel.league) }));
    if (o.capped) lines.push(el('div', { class: 'sub', text: t('battle.capped') }));
    if (r.worn) lines.push(el('div', { class: 'worn', text: t('battle.worn', r.me.name, t('condition.' + r.worn)) }));
    return [
      el('div', { class: 'banner ' + (r.won ? 'win' : 'lose'), text: r.won ? t('battle.victory') : t('battle.defeat') }),
      el('div', { class: 'sub center', text: t('battle.rounds', r.rounds) + ' · ' + t('battle.oddsWere', odds) }),
      ...lines,
      el('div', { class: 'sub center', style: 'margin-top:6px', text: t(r.won ? 'battle.whyWon' : 'battle.whyLost') }),
      el('ul', { class: 'why' }, ...why),
      el('div', { class: 'row', style: 'gap:8px;justify-content:center;margin-top:8px' },
        r.duel ? null : el('button', { class: 'btn', text: t('battle.rematch'), onclick: () => { closeArena(); send('startBattle', { leader: r.leader.id }); } }),
        el('button', { class: 'btn ghost', text: t('battle.close'), onclick: closeArena })),
    ];
  }

  window.addEventListener('keydown', e => { if (e.key === 'Escape' && stage && stage.firstChild) closeArena(); });

  return { init, setData, play, close: closeArena };
})();

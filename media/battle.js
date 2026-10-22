// The "Battle" tab of the album: your fighter, the gym ladder, the animated 1v1 arena and the result explained.
// The extension host simulates the fight and sends the whole log; this file only plays it back.
window.PTBattle = (function () {
  const { el, t, cardEl, marksEl, itemDesc, TYPE_ICON, sfx } = window.PT;
  const FACTORS = ['level', 'demand', 'rarity', 'stage', 'grade', 'tokens'];
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

  /** This week's boss: one fight at a time, three attempts, a big reward for the first victory. */
  function bossBox(d) {
    const b = d.boss;
    if (!b) return null;
    const canFight = !!d.fighter && !!b.card && b.attemptsLeft > 0;
    return box(t('boss.title'), el('div', { class: 'leader boss' + (b.won ? ' earned' : '') },
      el('div', { class: 'lthumb' }, b.src ? el('img', { src: b.src, alt: '' }) : el('div', { class: 'nm', text: b.name })),
      el('div', { class: 'linfo' },
        el('div', { class: 'row', style: 'justify-content:flex-start;gap:8px' }, el('b', { text: b.name }), el('span', { class: 'sub', text: (b.won ? '🏅 ' : '') + t('stats.level', b.level) + ' ' + typeIcons(b.types) })),
        el('div', { class: 'sub', text: t('boss.reward', b.reward.coins, b.reward.boxes) }),
        b.odds !== undefined ? bar(b.odds, b.odds >= 0.5 ? '' : 'warn') : null,
        el('div', { class: 'sub', text: (b.won ? t('boss.beaten') + ' · ' : '') + t('boss.attempts', b.attemptsLeft, b.attempts) + (b.odds !== undefined ? ' · ' + t('battle.odds', Math.round(b.odds * 100)) : (b.card ? '' : ' · ' + t('battle.downloading'))) }),
        el('div', { class: 'sub', text: t('boss.new') })),
      el('button', { class: 'btn', ...(canFight ? {} : { disabled: '' }), text: t('battle.challenge'), onclick: () => send('startBattle', { leader: b.id }) })));
  }

  /** The daily cup: three fights in a row, a small fee and a prize that grows with the rounds won. */
  function cupBox(d) {
    const c = d.cup;
    if (!c) return null;
    const note = c.played ? t('cup.playedToday') : !c.canPay ? t('cup.needCoins', c.fee) : '';
    return box(t('cup.title'),
      el('div', { class: 'sub', text: t('cup.desc', c.fee, c.prize[2], c.prize[3]) }),
      note ? el('div', { class: 'sub warnline', text: note }) : null,
      el('div', { class: 'row', style: 'justify-content:flex-start;margin-top:6px' },
        el('button', { class: 'btn', ...(d.fighter && !c.played && c.canPay ? {} : { disabled: '' }), text: t('cup.enter', c.fee), onclick: () => send('startCup') })));
  }

  /** The Elite Four: four trainers with a team of three, fought in order with your own team. */
  function eliteBox(d) {
    if (!d.elite) return null;
    const teamReady = d.team && d.team.size >= d.team.need;
    return box(t('elite.title'),
      el('div', { class: 'sub', text: t('elite.desc') }),
      d.elite[0] && !d.elite[0].unlocked ? el('div', { class: 'sub warnline', text: t('elite.badges', d.record.badges.length, d.leaders.length) }) : null,
      el('div', { class: 'sub', text: d.team && d.team.size > 1 ? t('elite.team', d.team.names.join(', ')) : t('elite.teamNone') }),
      ...d.elite.map((e, i) => {
        const prev = d.elite[i - 1];
        const ready = e.cards.every(c => c.src || c.name);
        const note = !e.unlocked ? (i === 0 ? t('elite.needBadges') : t('battle.locked', prev.name)) : !teamReady ? t('elite.needTeam') : e.odds === undefined ? t('battle.downloading') : t('battle.odds', Math.round(e.odds * 100));
        return el('div', { class: 'leader elite' + (e.beaten ? ' earned' : '') + (e.unlocked ? '' : ' locked') },
          el('div', { class: 'trio' }, e.cards.map(c => el('div', { class: 'lthumb' }, c.src ? el('img', { src: c.src, alt: '', title: c.name + ' ' + t('stats.level', c.level) }) : el('div', { class: 'nm', text: c.name })))),
          el('div', { class: 'linfo' },
            el('div', { class: 'row', style: 'justify-content:flex-start;gap:8px' }, el('b', { text: e.name }), el('span', { class: 'sub', text: (e.beaten ? t('elite.beaten') + ' · ' : '') + e.cards.map(c => c.name + ' ' + t('stats.level', c.level)).join(' · ') })),
            el('div', { class: 'sub', text: t('elite.first', e.reward.coins, e.reward.boxes) }),
            e.odds !== undefined && e.unlocked ? bar(e.odds, e.odds >= 0.5 ? '' : 'warn') : null,
            el('div', { class: 'sub', text: note })),
          el('button', { class: 'btn', ...(e.unlocked && teamReady && e.odds !== undefined && ready ? {} : { disabled: '' }), text: t('battle.challenge'), onclick: () => send('startElite', { id: e.id }) }));
      }));
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
    const nameOf = id => names[id] || id.replace(/^(boss|cup|elite):/, '').replace(/^./, c => c.toUpperCase());   // boss and cup rivals are named by their species
    return box(t('battle.history'), ...d.history.slice(0, 10).map(h => el('div', { class: 'hrow ' + (h.won ? 'won' : 'lost') },
      el('span', { text: (h.won ? '✔ ' : '✘ ') + t('battle.historyRow', nameOf(h.leader), h.card) }),
      el('span', { class: 'sub', text: t('battle.rounds', h.rounds) + (h.coins ? ' · 🪙 ' + h.coins : '') }))));
  }

  function render() {
    if (!data || !root) return;
    root.replaceChildren(...[recordBox(data), fighterBox(data), rocketBox(data), bossBox(data), cupBox(data), ladderBox(data), eliteBox(data), historyBox(data)].filter(Boolean));
  }

  /* ───── the arena: background by environment, attack effects by type ───── */
  const SCENE = { Fire: 'volcano', Water: 'lake', Grass: 'forest', Lightning: 'plant', Psychic: 'temple', Fighting: 'dojo', Darkness: 'night', Metal: 'factory', Dragon: 'peak', Fairy: 'garden', Colorless: 'meadow' };
  /** Where the fight takes place: league duels in a stadium, Team Rocket in their hideout, the rest by the rival's type. */
  const sceneOf = r => (r.duel ? 'stadium' : r.leader.id === 'rocket' ? 'hideout' : SCENE[(r.foe.types || [])[0]] || 'meadow');
  // Projectiles fly from the attacker to the target; impacts strike the target directly.
  const PROJECTILE = { Fire: '🔥', Water: '💧', Grass: '🍃', Psychic: '🔮', Darkness: '🌑', Dragon: '🔥', Fairy: '✨' };
  const IMPACT = { Lightning: '⚡', Fighting: '👊', Metal: '⚙️', Colorless: '⭐' };
  const calm = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IMPACT_DELAY = 340;

  /* ───── the arena ───── */
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function closeArena() { clearTimers(); cupQueue = []; stage.replaceChildren(); }

  function side(f, cls) {
    const hpText = el('span', { class: 'hptext', text: f.hp + ' / ' + f.hp });
    const hp = bar(1, 'big');
    hp.setAttribute('role', 'progressbar'); hp.setAttribute('aria-label', t('stats.hp') + ' ' + f.name); hp.setAttribute('aria-valuemin', '0'); hp.setAttribute('aria-valuemax', String(f.hp)); hp.setAttribute('aria-valuenow', String(f.hp));
    const card = cardEl({ name: f.name, tier: f.tier, src: f.src, variant: f.variant, care: f.care, grade: f.grade }, 170);
    const wrap = el('div', { class: 'arena-side ' + cls }, el('div', { class: 'arena-card' }, card),
      el('div', { class: 'row' }, el('b', { text: f.name }), el('span', { class: 'sub', text: t('stats.level', f.level) + ' ' + typeIcons(f.types) })), hp, hpText);
    return { wrap, hp: hp.querySelector('i'), hpText, max: f.hp, card: wrap.querySelector('.arena-card') };
  }

  let cupQueue = [];
  /** The cup: its rounds are played one after the other, each started from the previous result screen. */
  function playCup(rounds) { cupQueue = rounds.slice(1); play(rounds[0]); }

  function play(r) {
    clearTimers(); stage.replaceChildren();   // not closeArena(): that would also drop the rest of a cup
    const me = side(r.me, 'me'), foe = side(r.foe, 'foe');
    const logBox = el('div', { class: 'blog', 'aria-live': 'polite' });
    let speed = 1, i = 0, finished = false;
    const speedBtn = el('button', { class: 'btn ghost', text: '1×', onclick: () => { speed = speed === 1 ? 2 : 1; speedBtn.textContent = speed + '×'; } });
    const skipBtn = el('button', { class: 'btn ghost', text: t('battle.skip'), onclick: () => finish(true) });
    const resultBox = el('div', { class: 'bresult' });
    const fxLayer = el('div', { class: 'fx-layer' });
    const arena = el('div', { class: 'arena' },
      el('div', { class: 'arena-title', text: r.leader.kind === 'elite' ? t('battle.vsElite', r.leader.name, r.elite.duel, t('stats.level', r.leader.level)) : r.leader.kind === 'cup' ? t('battle.vsCup', r.cup.round, r.cup.of, r.leader.name, t('stats.level', r.leader.level)) : t(r.leader.kind === 'boss' ? 'battle.vsBoss' : 'battle.vs', r.leader.name, t('stats.level', r.leader.level)) }),
      el('div', { class: 'arena-fighters scene-' + sceneOf(r) }, foe.wrap, el('div', { class: 'vs', text: 'VS' }), me.wrap),
      logBox, el('div', { class: 'row', style: 'gap:8px;justify-content:center' }, speedBtn, skipBtn), resultBox, fxLayer);
    stage.replaceChildren(arena);
    skipBtn.focus();

    const by = s => (s === 'a' ? me : foe), nameOf = s => (s === 'a' ? r.me.name : r.foe.name);
    // The bar colour is backed by an icon and the numbers, so it does not rely on telling green from red.
    const setHp = (who, hp) => {
      const f = Math.max(0, hp / who.max), level = f > 0.5 ? 'high' : f > 0.2 ? 'mid' : 'low';
      who.hp.style.width = (f * 100).toFixed(1) + '%'; who.hp.parentNode.dataset.level = level; who.hp.parentNode.setAttribute('aria-valuenow', String(Math.max(0, hp)));
      who.hpText.textContent = (hp <= 0 ? '☠' : level === 'high' ? '♥' : level === 'mid' ? '⚠' : '❗') + ' ' + Math.max(0, hp) + ' / ' + who.max;
    };
    const line = (text, cls) => { logBox.append(el('div', { class: 'logline ' + (cls || ''), text })); while (logBox.children.length > 7) logBox.firstChild.remove(); logBox.scrollTop = logBox.scrollHeight; };

    /** The move's effect, drawn over the arena between the two cards. A miss flies past the target. */
    function playFx(attacker, target, kind, ev) {
      const base = arena.getBoundingClientRect();
      const mid = n => { const b = n.getBoundingClientRect(); return { x: b.left - base.left + b.width / 2, y: b.top - base.top + b.height / 2 }; };
      const from = mid(attacker.card), to = mid(target.card);
      const size = ev.crit ? 64 : 44;
      const put = (glyph, cls, at) => {
        const n = el('div', { class: 'fx fx-' + kind + ' ' + cls, text: glyph, style: 'left:' + (at.x - size / 2) + 'px;top:' + (at.y - size / 2) + 'px;font-size:' + size + 'px' });
        fxLayer.append(n);
        return n;
      };
      const done = (anim, n) => { anim.onfinish = () => n.remove(); timers.push(setTimeout(() => n.remove(), 1200 / speed)); };
      if (PROJECTILE[kind]) {
        const dx = to.x - from.x, dy = to.y - from.y, k = ev.miss ? 1.6 : 1;
        for (let i = 0; i < 3; i++) {   // the first copy is the projectile, the other two its trail
          const n = put(PROJECTILE[kind], i ? 'trail' : '', from);
          const anim = n.animate([
            { transform: 'translate(0,0) scale(.5) rotate(0deg)', opacity: 0 },
            { transform: 'translate(0,0) scale(.8) rotate(0deg)', opacity: i ? 0.5 : 1, offset: 0.12 },
            { transform: 'translate(' + dx * k + 'px,' + dy * k + 'px) scale(' + (ev.miss ? 0.7 : 1.2) + ') rotate(360deg)', opacity: ev.miss ? 0 : 1 },
          ], { duration: 420 / speed, delay: i * 55 / speed, easing: 'ease-in', fill: 'both' });
          done(anim, n);
        }
      } else if (!ev.miss) {
        const n = put(IMPACT[kind] || IMPACT.Colorless, '', to);
        done(n.animate([
          { transform: 'translateY(-' + (kind === 'Lightning' ? 160 : 40) + 'px) scale(.5)', opacity: 0 },
          { transform: 'translateY(0) scale(1.3)', opacity: 1, offset: 0.45 },
          { transform: 'translateY(0) scale(1.7)', opacity: 0 },
        ], { duration: 560 / speed, easing: 'ease-out', fill: 'both' }), n);
      }
      if (!ev.miss) {
        const ring = put('', 'ring', to);
        done(ring.animate([{ transform: 'scale(.3)', opacity: 0.9 }, { transform: 'scale(' + (ev.crit ? 3.2 : 2.2) + ')', opacity: 0 }], { duration: 480 / speed, delay: IMPACT_DELAY * 0.7 / speed, easing: 'ease-out', fill: 'both' }), ring);
      }
    }

    // Team fights: a card that won the previous duel starts this one with the HP it had left.
    const first = r.log[0];
    if (first && first.t === 'start') { setHp(me, first.a.hp); setHp(foe, first.b.hp); }

    function applyAttack(ev, animate) {
      const attacker = by(ev.side), target = by(ev.side === 'a' ? 'b' : 'a');
      if (!animate) { setHp(me, ev.hp.a); setHp(foe, ev.hp.b); }
      else {
        attacker.card.classList.add('lunge'); timers.push(setTimeout(() => attacker.card.classList.remove('lunge'), 350 / speed));
        const still = calm();
        if (!still) playFx(attacker, target, ((ev.side === 'a' ? r.me : r.foe).types || [])[0] || 'Colorless', ev);
        // Damage lands when the effect reaches the target.
        timers.push(setTimeout(() => {
          setHp(me, ev.hp.a); setHp(foe, ev.hp.b);
          if (ev.dmg > 0) { target.card.classList.add('hit'); timers.push(setTimeout(() => target.card.classList.remove('hit'), 350 / speed)); if (ev.crit) arena.classList.add('quake'); timers.push(setTimeout(() => arena.classList.remove('quake'), 350 / speed)); }
          const mark = ev.miss ? '' : ev.eff === 'weak' ? ' ▲' : ev.eff === 'resist' ? ' ▼' : '';   // super effective / not very effective, as in the games
          const pop = el('div', { class: 'dmg' + (ev.crit ? ' crit' : '') + (ev.miss ? ' miss' : '') + (ev.eff && !ev.miss ? ' eff-' + ev.eff : ''), text: ev.miss ? t('battle.missShort') : '−' + ev.dmg + mark });
          sfx(ev.miss ? 'miss' : ev.crit ? 'crit' : 'hit');
          if (ev.crit && !ev.miss) { arena.classList.add('flash'); timers.push(setTimeout(() => arena.classList.remove('flash'), 260 / speed)); }
          target.card.append(pop); timers.push(setTimeout(() => pop.remove(), 900 / speed));
        }, still ? 0 : IMPACT_DELAY / speed));
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
      sfx(r.won ? 'win' : 'lose');
      speedBtn.remove(); skipBtn.remove();
      resultBox.replaceChildren(...result(r));
      resultBox.querySelector('.btn')?.focus();
    }

    function next() {
      if (finished) return;
      if (i >= r.log.length) return finish(false);
      const ev = r.log[i++];
      if (ev.t === 'attack') { applyAttack(ev, true); timers.push(setTimeout(next, (ev.crit && !ev.miss ? 1350 : 900) / speed)); }   // a critical hit gets a beat of its own
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
    if (o.boxes) lines.push(el('div', { class: 'reward', text: t('battle.boxReward', o.boxes) }));
    if (o.firstWin) lines.push(el('div', { class: 'reward', text: r.leader.kind === 'boss' ? t('boss.beatenNow') : r.leader.kind === 'elite' ? t('elite.beatenNow') : t('battle.badgeEarned', r.leader.name) }));
    const es = r.eliteSummary;
    if (es) lines.push(el('div', { class: 'reward', text: es.won ? t('elite.won', r.leader.name) : t('elite.lost', r.leader.name) }), es.won ? el('div', { class: 'sub', text: t('elite.left', es.alive) }) : null);
    const cs = r.cupSummary;
    if (cs) lines.push(el('div', { class: 'reward', text: t('cup.result', cs.wins, r.cup.of) }), el('div', { class: 'sub', text: t('cup.feeLine', cs.fee) }),
      cs.coins || cs.boxes ? el('div', { class: 'reward', text: [cs.coins ? t('cup.prizeLine', cs.coins) : '', cs.boxes ? t('battle.boxReward', cs.boxes) : ''].filter(Boolean).join(' · ') }) : el('div', { class: 'sub', text: t('cup.noPrize') }));
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
        r.elite ? (r.elite.last ? el('button', { class: 'btn', text: t('battle.rematch'), onclick: () => { closeArena(); send('startElite', { id: r.leader.id.split(':')[1] }); } }) : el('button', { class: 'btn', text: t('elite.next'), onclick: () => { const next = cupQueue.shift(); if (next) play(next); } }))
          : r.cup ? (r.won && !r.cupSummary ? el('button', { class: 'btn', text: t('cup.next'), onclick: () => { const next = cupQueue.shift(); if (next) play(next); } }) : null)
          : r.duel ? null : el('button', { class: 'btn', text: t('battle.rematch'), onclick: () => { closeArena(); send('startBattle', { leader: r.leader.id }); } }),
        el('button', { class: 'btn ghost', text: t('battle.close'), onclick: closeArena })),
    ];
  }

  window.addEventListener('keydown', e => { if (e.key === 'Escape' && stage && stage.firstChild) closeArena(); });

  return { init, setData, play, playCup, close: closeArena };
})();

// The "League" tab of the album: sign in, leagues, ranking, rivals to challenge and the duels received.
// Everything it shows comes from the extension host (src/online/controller.ts); this file only draws it and sends the button presses.
window.PTLeague = (function () {
  const { el, t } = window.PT;
  let root, send, data = null;
  let nameInput = '', codeInput = '';

  function init(host) { root = host.root; send = host.send; }
  function setData(d) { data = d; render(); }

  const box = (title, ...kids) => el('div', { class: 'bbox' }, title ? el('h3', { text: title }) : null, ...kids);
  const errText = code => t('league.err.' + code) !== 'league.err.' + code ? t('league.err.' + code) : t('league.err.generic', code);

  function intro(d) {
    return box(t('league.title'),
      el('div', { class: 'sub', text: t('league.intro') }),
      el('ul', { class: 'why' }, ['league.p1', 'league.p2', 'league.p3', 'league.p4'].map(k => el('li', { text: t(k) }))),
      !d.configured ? el('div', { class: 'sub warnline', text: t('league.noServer') }) : null,
      el('div', { class: 'row', style: 'justify-content:flex-start;margin-top:8px' },
        el('button', { class: 'btn', ...(d.configured && !d.busy ? {} : { disabled: '' }), text: t('league.connect'), onclick: () => send('leagueConnect') })));
  }

  function header(d) {
    return box(null,
      el('div', { class: 'row' },
        el('div', {}, el('b', { text: t('league.signedIn', d.login || '…') }), el('div', { class: 'sub', text: t('league.today', d.board ? d.board.today.used : 0, d.board ? d.board.today.max : 10) })),
        el('div', { class: 'row', style: 'gap:6px' },
          el('button', { class: 'btn ghost', ...(d.busy ? { disabled: '' } : {}), text: t('league.refresh'), onclick: () => send('leagueRefresh') }),
          el('button', { class: 'btn ghost', text: t('league.delete'), title: t('league.deleteTip'), onclick: () => send('leagueDelete') }))));
  }

  function leaguesBox(d) {
    const name = el('input', { class: 'search', type: 'text', maxlength: '40', placeholder: t('league.newName'), value: nameInput, oninput: e => { nameInput = e.target.value; } });
    const code = el('input', { class: 'search', type: 'text', maxlength: '12', placeholder: t('league.codePlaceholder'), value: codeInput, oninput: e => { codeInput = e.target.value; } });
    return box(t('league.myLeagues'),
      d.leagues.length
        ? el('div', { class: 'chips' }, d.leagues.map(l => el('button', { class: 'chip' + (l.id === d.selected ? ' on' : ''), text: l.name + ' · ' + l.members, onclick: () => send('leagueSelect', { id: l.id }) })))
        : el('div', { class: 'sub', text: t('league.noLeagues') }),
      el('div', { class: 'toolbar' }, name, el('button', { class: 'btn', ...(d.busy ? { disabled: '' } : {}), text: t('league.create'), onclick: () => { send('leagueCreate', { name: nameInput }); nameInput = ''; } })),
      el('div', { class: 'toolbar' }, code, el('button', { class: 'btn', ...(d.busy ? { disabled: '' } : {}), text: t('league.join'), onclick: () => { send('leagueJoin', { code: codeInput }); codeInput = ''; } })));
  }

  function fighterBox(d) {
    const rows = [];
    if (!d.local.ok) rows.push(el('div', { class: 'sub warnline', text: t(d.local.reason === 'grading' ? 'battle.grading' : d.local.reason === 'soaked' ? 'battle.soaked' : 'battle.noFighter') }));
    else rows.push(el('div', { class: 'sub', text: t('league.localFighter', d.local.name, d.local.level) }));
    if (d.registered) {
      rows.push(el('div', { class: 'sub', text: t('league.registered', d.registered.name, d.registered.level) }));
      if (d.registered.clamped) rows.push(el('div', { class: 'sub warnline', text: t('league.clamped', d.registered.levelCap) }));
    }
    if (d.registered && d.registered.busted) {
      rows.push(el('div', { class: 'sub warnline', text: t('league.bustedYou') }));
      rows.push(el('div', { class: 'row', style: 'justify-content:flex-start;margin-top:4px' },
        el('button', { class: 'btn', ...(d.busy ? { disabled: '' } : {}), text: t('league.reborn'), onclick: () => send('leagueReborn') })));
    }
    rows.push(el('div', { class: 'sub', text: t('league.syncHint') }));
    return box(t('league.yourFighter'), ...rows);
  }

  const MEDAL = ['🥇', '🥈', '🥉'];
  /** "ends in 12 d" from the season's end date, or "ends today". */
  function endsText(endsAt) {
    const days = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 864e5);
    return days <= 1 ? t('league.endsToday') : t('league.endsIn', days);
  }

  function rankBox(d) {
    const b = d.board;
    if (!b) return null;
    const canDuel = !!d.registered && !d.busy && b.today.used < b.today.max;
    return box(b.league.name,
      el('div', { class: 'row' },
        el('span', { class: 'sub', text: t('league.code', b.league.code) }),
        el('div', { class: 'row', style: 'gap:6px' },
          el('button', { class: 'btn ghost', text: t('league.copy'), onclick: () => send('leagueCopy', { code: b.league.code }) }),
          el('button', { class: 'btn ghost', text: t('league.page'), onclick: () => send('leaguePage', { code: b.league.code }) }),
          el('button', { class: 'btn ghost', text: t('league.leave'), onclick: () => send('leagueLeave', { id: b.league.id }) }))),
      b.season ? el('div', { class: 'sub', title: t('league.seasonHint'), text: t('league.season', b.season.id, endsText(b.season.endsAt)) }) : null,
      b.podium && b.podium.entries.length ? el('div', { class: 'sub', text: t('league.podium', b.podium.season) + ': ' + b.podium.entries.map(e => MEDAL[e.rank - 1] + ' ' + e.login + ' (' + e.elo + ')').join(' · ') }) : null,
      ...b.members.map((m, i) => el('div', { class: 'leader' + (m.you ? ' earned' : '') + (m.busted ? ' busted' : '') },
        el('div', { class: 'rankn', text: '#' + (i + 1) }),
        el('div', { class: 'lthumb' }, m.fighter && m.fighter.src ? el('img', { src: m.fighter.src, alt: '' }) : el('div', { class: 'nm', text: m.fighter ? m.fighter.name : '?' })),
        el('div', { class: 'linfo' },
          el('div', { class: 'row', style: 'justify-content:flex-start;gap:8px' }, el('b', { text: m.login + (m.you ? ' ' + t('league.you') : '') }),
            m.crowns ? el('span', { title: t('league.crowns', m.crowns), text: '🏆' + (m.crowns > 1 ? '×' + m.crowns : '') }) : null,
            m.busted ? el('span', { class: 'bustflag', title: t('league.bustedTip'), text: t('league.busted') }) : null,
            el('span', { class: 'sub', text: 'Elo ' + m.elo + ' · ' + m.wins + '–' + m.losses })),
          el('div', { class: 'sub', text: m.fighter ? t('league.fighterLine', m.fighter.name, m.fighter.level) + (m.fighter.grade ? ' · TBGS ' + m.fighter.grade : '') + (m.fighter.held ? ' · ' + window.PT.itemIcon(m.fighter.held) : '') : t('league.noFighter') })),
        m.you ? null
          : m.busted ? el('button', { class: 'btn ghost', ...(m.youPardoned ? { disabled: '' } : {}), title: t('league.bustVoteTip'), text: t(m.youPardoned ? 'league.bustVoted' : 'league.bustVote', m.bustVotes || 0, b.pardonNeed), onclick: () => send('leaguePardon', { subject: m.id }) })
          : el('button', { class: 'btn', ...(canDuel && m.fighter ? {} : { disabled: '' }), text: t('league.challenge'), onclick: () => send('leagueChallenge', { rival: m.id }) }))));
  }

  function duelsBox(d) {
    const b = d.board;
    if (!b) return null;
    return box(t('league.recent'), b.duels.length
      ? b.duels.map(x => el('div', { class: 'hrow' + (x.you ? (x.winner === d.login ? ' won' : ' lost') : '') },
        el('span', { text: t('league.duelLine', x.winner, x.winner === x.challenger ? x.defender : x.challenger, x.rounds) }),
        el('span', { class: 'sub', text: new Date(x.at).toLocaleDateString() })))
      : el('div', { class: 'sub', text: t('league.noDuels') }));
  }

  function replaysBox(d) {
    if (!d.replays.length) return null;
    return box(t('league.replays'), d.replays.map(r => el('div', { class: 'hrow ' + (r.won ? 'won' : 'lost') },
      el('span', { text: (r.won ? '✔ ' : '✘ ') + t(r.incoming ? 'league.replayIn' : 'league.replayOut', r.rival, r.league) + ' (' + (r.eloChange > 0 ? '+' : '') + r.eloChange + ' Elo)' }),
      el('button', { class: 'btn ghost', text: t('league.watch'), onclick: () => send('leagueReplay', { id: r.id }) }))));
  }

  function render() {
    if (!data || !root) return;
    const d = data;
    // Keep what is being typed when the tab redraws.
    const typing = document.activeElement && root.contains(document.activeElement) ? document.activeElement.placeholder : null;
    const parts = [];
    if (d.error) parts.push(el('div', { class: 'bbox errbox', role: 'alert', text: errText(d.error) }));
    if (d.notice === 'deleted') parts.push(el('div', { class: 'bbox', text: t('league.deletedNote') }));
    if (!d.connected) parts.push(intro(d));
    else parts.push(header(d), leaguesBox(d), fighterBox(d), rankBox(d), duelsBox(d), replaysBox(d));
    root.replaceChildren(...parts.filter(Boolean));
    if (typing) { const again = [...root.querySelectorAll('input')].find(i => i.placeholder === typing); if (again) { again.focus(); const n = again.value.length; again.setSelectionRange(n, n); } }
  }

  return { init, setData };
})();

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XP_PER_LEVEL } from '../src/game/engine';
import {
  BASE_LEVEL_CAP, ELO_K, LEVELS_PER_DAY,
  checkClaim, cleanLeagueName, eloDelta, inviteCode, isImplausible, levelCap, normalizeCode, readProfile,
} from '../server/lib/rules';
import { signSession, verifySession } from '../server/lib/auth';

const DAY = 864e5;

test('level cap: a new player starts low and the cap rises every day until level 50', () => {
  const t0 = 1_000_000_000_000;
  assert.equal(levelCap(t0, t0), BASE_LEVEL_CAP);
  assert.equal(levelCap(t0, t0 + 2 * DAY + 5), BASE_LEVEL_CAP + 2 * LEVELS_PER_DAY);
  assert.equal(levelCap(t0, t0 + 365 * DAY), 50);
  assert.equal(levelCap(t0, t0 - DAY), BASE_LEVEL_CAP, 'a clock that went back never lowers it');
});

test('a fighter claim is validated, and an inflated level is clamped to the cap instead of refused', () => {
  const t0 = 1_000_000_000_000;
  const ok = checkClaim({ key: 'base1-4', xp: 3 * XP_PER_LEVEL, grade: 9, held: 'quick-claw', quotaPct: 80 }, t0, t0);
  assert.ok(ok.ok && !ok.clamped);
  if (ok.ok) { assert.deepEqual(ok.claim, { key: 'base1-4', xp: 3 * XP_PER_LEVEL, grade: 9, held: 'quick-claw', quotaPct: 80 }); }

  const big = checkClaim({ key: 'base1-4#first', xp: 49 * XP_PER_LEVEL, quotaPct: 500 }, t0, t0);
  assert.ok(big.ok && big.clamped);
  if (big.ok) {
    assert.equal(big.claim.xp, (BASE_LEVEL_CAP - 1) * XP_PER_LEVEL);
    assert.equal(big.claim.quotaPct, 200, 'the declared quota is capped');
    assert.equal(big.cap, BASE_LEVEL_CAP);
  }
  const old = checkClaim({ key: 'base1-4', xp: 49 * XP_PER_LEVEL, quotaPct: 0 }, t0, t0 + 365 * DAY);
  assert.ok(old.ok && !old.clamped);
});

test('a fighter claim with nonsense is refused with a reason', () => {
  const t = 1_000_000_000_000;
  const bad = (raw: unknown) => { const r = checkClaim(raw, t, t); return r.ok ? 'ok' : r.error; };
  assert.equal(bad(null), 'invalid-card');
  assert.equal(bad({ key: '../../etc/passwd', xp: 0 }), 'invalid-card');
  assert.equal(bad({ key: 'base1-4', xp: -5 }), 'invalid-xp');
  assert.equal(bad({ key: 'base1-4', xp: 'lots' }), 'invalid-xp');
  assert.equal(bad({ key: 'base1-4', xp: 0, grade: 11 }), 'invalid-grade');
  assert.equal(bad({ key: 'base1-4', xp: 0, grade: 7.5 }), 'invalid-grade');
  assert.equal(bad({ key: 'base1-4', xp: 0, held: 'rare-candy' }), 'invalid-item');
  assert.equal(bad({ key: 'base1-4', xp: 0 }), 'ok');
});

test('Elo: equal players trade 16 points, an upset pays more, and every duel moves the ranking', () => {
  assert.equal(eloDelta(1000, 1000, true), ELO_K / 2);
  assert.equal(eloDelta(1000, 1000, false), -ELO_K / 2);
  assert.ok(eloDelta(1000, 1400, true) > eloDelta(1000, 1000, true));
  assert.ok(eloDelta(1400, 1000, true) >= 1, 'a favorite who wins still gains a point');
  assert.ok(eloDelta(1400, 1000, false) < -16);
  assert.ok(eloDelta(3000, 1000, true) >= 1 && eloDelta(1000, 3000, false) <= -1);
});

test('readProfile keeps only sane non-negative numbers', () => {
  assert.deepEqual(readProfile({ coins: -5, cards: 'x', items: 3, xp: 10, tokens: 3 }), { coins: 0, cards: 0, items: 3, xp: 10, tokens: 3 });
  assert.deepEqual(readProfile(null), { coins: 0, cards: 0, items: 0, xp: 0, tokens: 0 });
});

test('isImplausible: flags an edited save, allows an honest one, and never flags a shrink', () => {
  const zero = { coins: 0, cards: 0, items: 0, xp: 0, tokens: 0 };
  const honest = { coins: 500, cards: 25, items: 10, xp: 5_000_000, tokens: 6_000_000 };
  assert.equal(isImplausible(honest, zero, 2 * DAY), false);
  // each edited field on its own is enough to flag it (same honest token count)
  assert.equal(isImplausible({ ...honest, coins: 900_000_000 }, zero, 2 * DAY), true, 'millions of coins');
  assert.equal(isImplausible({ ...honest, cards: 3000 }, zero, 2 * DAY), true, 'thousands of cards');
  assert.equal(isImplausible({ ...honest, xp: 2_000_000_000 }, zero, 2 * DAY), true, 'every card maxed');
  assert.equal(isImplausible({ ...honest, tokens: 5_000_000_000 }, zero, 1 * DAY), true, 'more token use than one day allows');
  // only growth is checked: measured from a baseline that already holds a lot, the same report is fine
  assert.equal(isImplausible({ ...honest, coins: 900_000_000 }, { ...honest, coins: 900_000_000 }, 0), false, 'a vouched baseline');
  // having less than before (sold, mishap, reset) is always fine
  assert.equal(isImplausible({ coins: 0, cards: 1, items: 0, xp: 0, tokens: 6_000_000 }, honest, 2 * DAY), false);
});

test('invite codes: unambiguous letters, typed in any case, with or without the dash', () => {
  let n = 0;
  const rng = () => ((n++ * 7919) % 1000) / 1000;
  const code = inviteCode(rng);
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(!/[01OIL]/.test(code));
  assert.equal(normalizeCode('k7mq 4xpd'), 'K7MQ-4XPD');
  assert.equal(normalizeCode('K7MQ-4XPD'), 'K7MQ-4XPD');
  assert.equal(normalizeCode('K7MQ'), undefined);
  assert.equal(cleanLeagueName('  My   friends '), 'My friends');
  assert.equal(cleanLeagueName('x'), undefined);
  assert.equal(cleanLeagueName('x'.repeat(41)), undefined);
  assert.equal(cleanLeagueName(5), undefined);
});

test('sessions: signed, expiring, and tampering is detected', () => {
  const now = 1_700_000_000_000;
  const token = signSession({ sub: 42, login: 'ash', exp: now + 1000 }, 'secret');
  assert.deepEqual(verifySession(token, 'secret', now), { sub: 42, login: 'ash', exp: now + 1000 });
  assert.equal(verifySession(token, 'other', now), undefined, 'a different secret');
  assert.equal(verifySession(token, 'secret', now + 2000), undefined, 'expired');
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 1, login: 'admin', exp: now + 1000 })).toString('base64url');
  assert.equal(verifySession(forged + '.' + sig, 'secret', now), undefined, 'a changed payload');
  assert.equal(verifySession(body, 'secret', now), undefined);
  assert.equal(verifySession(undefined, 'secret', now), undefined);
  assert.equal(verifySession('a.b', 'secret', now), undefined);
});

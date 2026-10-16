import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, seed, sweep, active, canView, remaining, areFriends, eventAudience, findEvent, visibleEvents, migrate, matchContactNumbers, VOTING_MS, RETENTION_MS } from '../src/domain/model.ts';

const now = 1_800_000_000_000;
const close = s => s.groups.find(g => g.id === 'close');
const photo = n => ({ id: `p${n}`, uri: 'demo', demo: true });
const as = (s, userId) => apply(s, { type: 'switch', userId }, now);

test('extra shots keep the first deadline and existing votes; a fourth shot fails', () => {
  let s = seed(now);
  s = apply(s, { type: 'append', groupId: 'close', lookId: 'example', photo: photo(2) }, now + VOTING_MS - 2);
  s = apply(s, { type: 'append', groupId: 'close', lookId: 'example', photo: photo(3) }, now + VOTING_MS - 1);
  assert.equal(close(s).look.startedAt, now);
  assert.equal(close(s).look.photos.length, 3);
  assert.equal(Object.keys(close(s).look.votes).length, 2);
  assert.throws(() => apply(s, { type: 'append', groupId: 'close', lookId: 'example', photo: photo(4) }, now + 10));
  assert.throws(() => apply(seed(now), { type: 'append', groupId: 'close', lookId: 'example', photo: photo(2) }, now + VOTING_MS));
});

test('votes replace one another, repeated requests are idempotent and the author cannot vote', () => {
  let s = as(seed(now), 'mark');
  const a = { type: 'vote', groupId: 'close', lookId: 'example', value: 'like' };
  s = apply(s, a, now + 10);
  assert.equal(close(s).look.votes.mark.value, 'like');
  assert.equal(close(s).look.votes.mark.changed, true);
  assert.equal(Object.keys(close(s).look.votes).length, 2);
  const repeated = apply(s, a, now + 20);
  assert.deepEqual(close(repeated).look.votes, close(s).look.votes);
  assert.throws(() => apply(as(s, 'maria'), a, now + 30));
});

test('15-minute and one-hour access boundaries are exact, including stale votes and restarts', () => {
  const s = seed(now);
  assert.equal(remaining(close(s).look, now), '15:00');
  assert.equal(remaining(close(s).look, now + VOTING_MS), '00:00');
  assert.equal(active(close(s).look, now + VOTING_MS - 1), true);
  assert.equal(canView(s, close(s), 'anna', now + VOTING_MS), false);
  assert.equal(canView(s, close(s), 'maria', now + VOTING_MS), true);
  assert.equal(canView(s, close(s), 'ira', now), false);
  assert.equal(canView(s, close(s), 'maria', now + RETENTION_MS), false);
  assert.throws(() => apply(as(s, 'anna'), { type: 'vote', groupId: 'close', lookId: 'example', value: 'dislike' }, now + VOTING_MS));
  const restored = sweep(JSON.parse(JSON.stringify(s)), now + RETENTION_MS);
  assert.equal(close(restored).look, undefined);
  assert.equal(restored.groups.length, 2);
  assert.equal(restored.notices.filter(n => n.id === 'closed-example').length, 1);
  assert.equal(sweep(restored, now + RETENTION_MS + 1).notices.length, 1);
});

test('new look ends the old voting immediately; it restarts only after publication and sends no new notice', () => {
  let s = apply(seed(now), { type: 'draft', groupId: 'close', draftId: 'd', replace: true }, now + 1);
  assert.equal(close(s).look, undefined);
  assert.equal(s.draft.photos.length, 0);
  assert.throws(() => apply(as(s, 'anna'), { type: 'vote', groupId: 'close', lookId: 'example', value: 'like' }, now + 2));
  s = apply(s, { type: 'draft-photo', draftId: 'd', photo: photo(1) }, now + 10);
  s = apply(s, { type: 'publish', groupId: 'close', draftId: 'd' }, now + 120000);
  assert.equal(close(s).look.startedAt, now + 120000);
  assert.deepEqual(close(s).look.votes, {});
  assert.equal(s.notices.filter(n => n.userId !== 'maria').length, 0);
  assert.equal(s.history.length, 1);
  assert.equal(active(s.history[0].look, now + 120000), false);
  assert.equal(canView(s, s.history[0], 'anna', now + 120000), false);
  assert.equal(findEvent(s, 'close', 'example').look.id, 'example');
  assert.equal(s.draft, undefined);
  assert.throws(() => apply(s, { type: 'publish', groupId: 'close', draftId: 'd' }, now + 120001));
});

test('audience must be friends, be nonempty and have no duplicates', () => {
  let s = seed(now);
  assert.throws(() => apply(s, { type: 'group', groupId: 'new', memberIds: [] }, now));
  assert.throws(() => apply(s, { type: 'group', groupId: 'new', memberIds: ['maria'] }, now));
  s = as(s, 'anna');
  assert.throws(() => apply(s, { type: 'group', groupId: 'new', memberIds: ['mark'] }, now));
  s = as(s, 'maria');
  s = apply(s, { type: 'group', groupId: 'new', memberIds: ['anna', 'anna', 'mark'] }, now);
  assert.deepEqual(s.groups.find(g => g.id === 'new').memberIds, ['maria', 'anna', 'mark']);
});

test('friend request must be confirmed by recipient; duplicates and self-add are prevented', () => {
  let s = as(seed(now), 'anna');
  const a = { type: 'request', to: 'lena' };
  s = apply(s, a, now);
  s = apply(s, a, now);
  assert.equal(s.requests.length, 1);
  assert.equal(areFriends(s, 'anna', 'lena'), false);
  const req = s.requests[0].id;
  assert.throws(() => apply(s, { type: 'resolve-request', requestId: req, accept: true }, now));
  s = apply(as(s, 'lena'), { type: 'resolve-request', requestId: req, accept: true }, now);
  assert.equal(areFriends(s, 'anna', 'lena'), true);
  assert.equal(s.requests.length, 0);
  assert.throws(() => apply(s, { type: 'request', to: 'lena' }, now));
});

test('requests can be declined and cancelled; one-sided contact import automatically connects registered users', () => {
  let s = apply(as(seed(now), 'anna'), { type: 'request', to: 'lena' }, now);
  s = apply(as(s, 'lena'), { type: 'resolve-request', requestId: s.requests[0].id, accept: false }, now);
  assert.equal(s.requests.length, 0);
  s = apply(as(s, 'anna'), { type: 'request', to: 'lena' }, now);
  s = apply(s, { type: 'cancel-request', requestId: s.requests[0].id }, now);
  assert.equal(s.requests.length, 0);
  s = apply(s, { type: 'contacts', userIds: ['lena'] }, now);
  assert.equal(areFriends(s, 'anna', 'lena'), true);
  s = apply(as(s, 'lena'), { type: 'contacts', userIds: ['anna'] }, now);
  assert.equal(areFriends(s, 'anna', 'lena'), true);
});

test('invites are deduplicated, preserve votes and deadline, and fail after expiration', () => {
  let s = apply(seed(now), { type: 'invite', groupId: 'close', memberIds: ['ira', 'ira', 'anna'] }, now + 1000);
  assert.equal(close(s).look.startedAt, now);
  assert.equal(close(s).memberIds.filter(v => v === 'ira').length, 1);
  assert.equal(s.notices.filter(n => n.userId === 'ira').length, 1);
  s = apply(s, { type: 'invite', groupId: 'close', memberIds: ['ira'] }, now + 2000);
  assert.equal(s.notices.filter(n => n.userId === 'ira').length, 1);
  assert.throws(() => apply(s, { type: 'invite', groupId: 'close', memberIds: ['katya'] }, now + VOTING_MS));
});

test('block hides author content without self-blocking, can be undone; leaving revokes access', () => {
  let s = apply(as(seed(now), 'anna'), { type: 'block', userId: 'maria', blocked: true }, now);
  assert.equal(canView(s, close(s), 'anna', now), false);
  assert.equal(canView(s, close(s), 'maria', now), true);
  s = apply(s, { type: 'block', userId: 'maria', blocked: false }, now);
  assert.equal(canView(s, close(s), 'anna', now), true);
  s = apply(s, { type: 'leave', groupId: 'close' }, now);
  assert.equal(canView(s, close(s), 'anna', now), false);
  assert.equal(close(s).look.votes.anna, undefined);
});

test('draft metadata, photos, votes and selected profile survive a JSON storage roundtrip', () => {
  let s = apply(seed(now), { type: 'draft', draftId: 'd' }, now);
  s = apply(s, { type: 'draft-photo', draftId: 'd', photo: photo(1) }, now);
  s = apply(s, { type: 'draft-details', draftId: 'd', question: 'Как сидит?', part: 'Низ' }, now);
  const restored = JSON.parse(JSON.stringify(s));
  assert.deepEqual(restored, s);
  assert.throws(() => apply(s, { type: 'draft', draftId: 'other' }, now));
  assert.throws(() => apply(as(s, 'anna'), { type: 'draft-photo', draftId: 'd', photo: photo(2) }, now));
  assert.equal(sweep(s, now + RETENTION_MS).draft, undefined);
});

test('profile validation rejects duplicate and malformed phones; ID is immutable; deletion removes own data', () => {
  const s = seed(now);
  assert.throws(() => apply(s, { type: 'profile', name: 'Мария', phone: '+70000000002' }, now));
  assert.throws(() => apply(s, { type: 'profile', name: 'Мария', handle: 'maria', phone: '123' }, now));
  const next = apply(s, { type: 'delete-profile' }, now);
  assert.equal(next.people.some(p => p.id === 'maria'), false);
  assert.equal(next.groups.some(g => g.ownerId === 'maria'), false);
  assert.equal(next.friendships.some(pair => pair.includes('maria')), false);
  assert.equal(next.signedIn, false);
});

test('changing a saved group after voting does not rewrite the previous result audience', () => {
  const s = apply(seed(now), { type: 'group', groupId: 'close', memberIds: ['ira'] }, now + VOTING_MS);
  assert.deepEqual(close(s).memberIds, ['maria', 'ira']);
  assert.deepEqual(close(s).look.recipientIds, ['maria', 'anna', 'mark', 'lena']);
  assert.equal(close(s).look.votes.mark.value, 'dislike');
});

test('disabling outfit notices does not suppress friend requests', () => {
  let s = apply(as(seed(now), 'lena'), { type: 'notifications', enabled: false }, now);
  s = apply(as(s, 'anna'), { type: 'request', to: 'lena' }, now);
  assert.equal(s.notices.filter(n => n.userId === 'lena').length, 1);
});


test('registration requires photo, name and unique phone; generated IDs survive profile edits', () => {
  const s = seed(now);
  assert.throws(() => apply(s, { type: 'register', name: 'А', phone: '+79991234567', avatar: photo(1) }, now));
  assert.throws(() => apply(s, { type: 'register', name: 'Игорь', phone: '+79991234567' }, now));
  assert.throws(() => apply(s, { type: 'register', name: 'Игорь', phone: '+70000000001', avatar: photo(1) }, now));
  const next = apply(s, { type: 'register', name: 'Игорь Иванов', phone: '8 (999) 123-45-67', avatar: photo(1) }, now);
  const p = next.people.find(p => p.id === next.activeUserId);
  assert.equal(next.registeredUserId, p.id);
  assert.equal(next.signedIn, true);
  assert.match(p.handle, /^pr_/);
  assert.equal(p.phone, '+79991234567');
  const edited = apply(next, { type: 'profile', name: 'Игорь', phone: p.phone, avatar: photo(2), handle: 'tampered' }, now);
  assert.equal(edited.people.find(v => v.id === p.id).handle, p.handle);
  assert.equal(edited.people.find(v => v.id === p.id).avatar.id, 'p2');
  assert.equal(edited.people.find(v => v.id === 'anna').name, 'Аня Белова');
});

test('hidden events expose only own vote to recipients; author sees named results until expiry', () => {
  let s = seed(now);
  close(s).look.hidden = true;
  const g = close(s);
  assert.deepEqual(eventAudience(s, g, 'anna', now), { memberIds: ['maria', 'anna'], votes: { anna: g.look.votes.anna } });
  assert.deepEqual(eventAudience(s, g, 'maria', now).votes, g.look.votes);
  assert.equal(eventAudience(s, g, 'ira', now), undefined);
  assert.equal(eventAudience(s, g, 'anna', now + RETENTION_MS), undefined);
  assert.equal(eventAudience(s, g, 'anna', now + VOTING_MS), undefined);
  g.look.hidden = false;
  assert.equal(eventAudience(s, g, 'anna', now).votes.mark.value, 'dislike');
});

test('contact matching normalizes and deduplicates numbers, excludes self and blocked users, uses profile names', () => {
  let s = as(seed(now), 'anna');
  let matched = matchContactNumbers(s, ['8 (000) 000-00-03', '+70000000003', '+70000000002', 'bad', '+79999999999']);
  assert.deepEqual(matched.map(p => p.id), ['mark']);
  assert.equal(matched[0].name, 'Марк Орлов');
  s = apply(s, { type: 'block', userId: 'mark', blocked: true }, now);
  assert.equal(matchContactNumbers(s, ['+70000000003']).length, 0);
});

test('history retains separate events, role lists and original expiry; leaving one does not alter another', () => {
  let s = apply(seed(now), { type: 'draft', groupId: 'close', draftId: 'd', replace: true }, now + 1);
  s = apply(s, { type: 'draft-photo', draftId: 'd', photo: photo(2) }, now + 2);
  s = apply(s, { type: 'draft-details', draftId: 'd', question: 'Новый', part: 'Верх', hidden: true }, now + 3);
  s = apply(s, { type: 'publish', groupId: 'close', draftId: 'd' }, now + 4);
  assert.equal(close(s).look.hidden, true);
  assert.equal(s.history[0].look.hidden, false);
  assert.equal(visibleEvents(s, 'anna', now + 10).length, 1);
  assert.equal(visibleEvents(s, 'maria', now + 10).length, 2);
  s = apply(as(s, 'anna'), { type: 'leave', groupId: 'close', lookId: 'example' }, now + 10);
  assert.equal(canView(s, s.history[0], 'anna', now + 10), false);
  assert.equal(canView(s, close(s), 'anna', now + 10), true);
  const expired = sweep(s, now + RETENTION_MS);
  assert.equal(expired.history.length, 0);
  assert.ok(close(expired).look);
  assert.equal(sweep(expired, now + RETENTION_MS + 4).groups[0].look, undefined);
});

test('v1 migration retains existing accounts, avatar-free profiles and saved groups', () => {
  const old = seed(now); old.version = 1; delete old.history;
  const migrated = migrate(JSON.parse(JSON.stringify(old)));
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.history, []);
  assert.deepEqual(migrated.groups, old.groups);
  assert.equal(migrated.people[0].handle, old.people[0].handle);
});


test('each appended photo notifies all accessible recipients, including voters, with the exact event link', () => {
  let s = seed(now); close(s).look.hidden = true;
  s = apply(as(s, 'lena'), { type: 'leave', groupId: 'close' }, now);
  s = apply(as(s, 'maria'), { type: 'append', groupId: 'close', lookId: 'example', photo: photo(2) }, now + 10);
  assert.deepEqual(s.notices.map(n => n.userId).sort(), ['anna', 'mark']);
  for (const n of s.notices) {
    assert.match(n.text, /Мария.*новое фото/);
    assert.equal(findEvent(s, n.groupId, n.lookId).look.id, 'example');
  }
  const repeated = apply(s, { type: 'append', groupId: 'close', lookId: 'example', photo: photo(2) }, now + 11);
  assert.equal(repeated.notices.length, 2);
  assert.equal(close(s).look.startedAt, now);
  assert.equal(close(s).look.votes.mark.value, 'dislike');
});

test('new and changed votes notify only the author, never repeat an unchanged vote or expose hidden votes', () => {
  let s = seed(now); close(s).look.hidden = true;
  s = apply(as(s, 'lena'), { type: 'vote', groupId: 'close', lookId: 'example', value: 'dislike' }, now + 1);
  assert.equal(s.notices.length, 1);
  assert.equal(s.notices[0].userId, 'maria');
  assert.match(s.notices[0].text, /Лена Волкова.*поставил.*не нравится/);
  assert.equal(s.notices[0].lookId, 'example');
  s = apply(s, { type: 'vote', groupId: 'close', lookId: 'example', value: 'like' }, now + 2);
  assert.equal(s.notices.length, 2);
  assert.match(s.notices[0].text, /изменил.*нравится/);
  const repeated = apply(s, { type: 'vote', groupId: 'close', lookId: 'example', value: 'like' }, now + 3);
  assert.equal(repeated.notices.length, 2);
  assert.equal(eventAudience(s, close(s), 'anna', now + 3).votes.lena, undefined);
  assert.throws(() => apply(s, { type: 'vote', groupId: 'close', lookId: 'example', value: 'dislike' }, now + VOTING_MS));
});

test('photo and vote notices respect settings, blocking and the original archived event', () => {
  let s = seed(now);
  s = apply(as(s, 'anna'), { type: 'notifications', enabled: false }, now);
  s = apply(as(s, 'mark'), { type: 'block', userId: 'maria', blocked: true }, now);
  s = apply(as(s, 'maria'), { type: 'append', groupId: 'close', lookId: 'example', photo: photo(2) }, now + 1);
  assert.deepEqual(s.notices.map(n => n.userId), ['lena']);
  const n = s.notices[0];
  s = apply(s, { type: 'notifications', enabled: false }, now + 2);
  s = apply(as(s, 'lena'), { type: 'vote', groupId: 'close', lookId: 'example', value: 'like' }, now + 3);
  assert.equal(s.notices.length, 1);
  s = apply(as(s, 'maria'), { type: 'draft', groupId: 'close', draftId: 'd', replace: true }, now + 4);
  assert.equal(findEvent(s, n.groupId, n.lookId).look.id, 'example');
  assert.equal(findEvent(sweep(s, now + RETENTION_MS), n.groupId, n.lookId), undefined);
});

test('named templates save a private audience and preselect it for a new look without inviting anyone', () => {
  let s = apply(seed(now), { type: 'template', templateId: 'family-template', name: ' Семья ', memberIds: ['anna', 'anna', 'mark'] }, now);
  assert.deepEqual(s.templates[0], { id: 'family-template', ownerId: 'maria', name: 'Семья', memberIds: ['anna', 'mark'] });
  assert.equal(s.notices.length, 0);
  s = apply(s, { type: 'draft', draftId: 'd', templateId: 'family-template' }, now + 1);
  assert.deepEqual(s.draft.memberIds, ['anna', 'mark']);
  s = apply(s, { type: 'draft-photo', draftId: 'd', photo: photo(1) }, now + 2);
  s = apply(s, { type: 'publish', draftId: 'd', groupId: 'family-event', memberIds: s.draft.memberIds }, now + 3);
  assert.deepEqual(s.groups.find(g => g.id === 'family-event').memberIds, ['maria', 'anna', 'mark']);
  assert.equal(s.notices.filter(n => n.groupId === 'family-event').length, 2);
  const expired = sweep(s, now + RETENTION_MS + 3);
  assert.equal(expired.groups.find(g => g.id === 'family-event').look, undefined);
  assert.equal(expired.templates[0].name, 'Семья');
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(expired))).templates, expired.templates);
});

test('template edits and deletion do not change previous events; template ownership and validation are enforced', () => {
  let s = apply(seed(now), { type: 'template', templateId: 't', name: 'Семья', memberIds: ['anna', 'mark'] }, now);
  assert.throws(() => apply(s, { type: 'template', templateId: 'other', name: 'семья', memberIds: ['anna'] }, now));
  assert.throws(() => apply(s, { type: 'template', templateId: 'other', name: '', memberIds: ['anna'] }, now));
  assert.throws(() => apply(s, { type: 'template', templateId: 'other', name: 'Пустой', memberIds: [] }, now));
  const other = as(s, 'anna');
  assert.throws(() => apply(other, { type: 'draft', draftId: 'd', templateId: 't' }, now));
  assert.throws(() => apply(other, { type: 'template', templateId: 't', name: 'Чужой', memberIds: ['maria'] }, now));
  assert.throws(() => apply(other, { type: 'delete-template', templateId: 't' }, now));
  s = apply(s, { type: 'template', templateId: 't', name: 'Близкие', memberIds: ['ira'] }, now);
  assert.deepEqual(close(s).memberIds, ['maria', 'anna', 'mark', 'lena']);
  s = apply(s, { type: 'delete-template', templateId: 't' }, now);
  assert.equal(s.templates.length, 0);
  assert.equal(close(s).look.id, 'example');
});

test('blocked template members are excluded from a new draft; pre-template data migrates', () => {
  let s = apply(seed(now), { type: 'template', templateId: 't', name: 'Семья', memberIds: ['anna', 'mark'] }, now);
  s = apply(s, { type: 'block', userId: 'mark', blocked: true }, now);
  s = apply(s, { type: 'draft', draftId: 'd', templateId: 't' }, now);
  assert.deepEqual(s.draft.memberIds, ['anna']);
  const old = seed(now); delete old.templates;
  assert.deepEqual(migrate(old).templates, []);
});


test('all recipients lose events, photos, audiences and notice targets at 15 minutes while author retains results until one hour', () => {
  for (const hidden of [false, true]) {
    const s = seed(now); close(s).look.hidden = hidden;
    for (const userId of ['anna', 'mark', 'lena']) {
      // Includes users who voted and a user who has not voted yet.
      assert.equal(canView(s, close(s), userId, now + VOTING_MS - 1), true);
      assert.equal(visibleEvents(s, userId, now + VOTING_MS).length, 0);
      assert.equal(canView(s, findEvent(s, 'close', 'example'), userId, now + VOTING_MS), false);
      assert.equal(eventAudience(s, close(s), userId, now + VOTING_MS), undefined);
    }
    const restored = sweep(JSON.parse(JSON.stringify(s)), now + VOTING_MS);
    assert.equal(visibleEvents(restored, 'anna', now + VOTING_MS).length, 0);
    assert.equal(canView(restored, close(restored), 'maria', now + RETENTION_MS - 1), true);
    assert.equal(close(restored).look.votes.mark.value, 'dislike');
    assert.equal(eventAudience(restored, close(restored), 'maria', now + VOTING_MS).votes.anna.value, 'like');
    assert.equal(canView(restored, close(restored), 'maria', now + RETENTION_MS), false);
    assert.equal(close(sweep(restored, now + RETENTION_MS)).look, undefined);
  }
});

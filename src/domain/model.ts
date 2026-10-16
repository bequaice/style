// Local domain rules. All access and deadline checks must be repeated by the future server.
export const VOTING_MS = 15 * 60 * 1000;
export const RETENTION_MS = 60 * 60 * 1000;
export type VoteValue = 'like' | 'dislike';
export type BodyPart = 'Весь образ' | 'Верх' | 'Низ' | 'Обувь';
export type Person = { id: string; name: string; handle: string; phone: string; tone: string; contacts: string[]; notifications: boolean; avatar?: Photo };
export type Photo = { id: string; uri: string; demo?: boolean };
export type Vote = { value: VoteValue; updatedAt: number; changed: boolean };
export type Look = { id: string; authorId: string; photos: Photo[]; question: string; part: BodyPart; startedAt: number; votes: Record<string, Vote>; recipientIds?: string[]; hidden?: boolean; endedAt?: number };
export type Group = { id: string; ownerId: string; memberIds: string[]; look?: Look };
export type AudienceTemplate = { id: string; ownerId: string; name: string; memberIds: string[] };
export type Draft = { id: string; authorId: string; groupId?: string; photos: Photo[]; question: string; part: BodyPart; createdAt: number; memberIds?: string[]; hidden?: boolean };
export type FriendRequest = { id: string; from: string; to: string };
export type Notice = { id: string; userId: string; text: string; groupId?: string; lookId?: string; time: number; read: boolean };
export type State = {
  version: 2; templates: AudienceTemplate[]; registeredUserId?: string; history: Group[]; signedIn: boolean; activeUserId: string; people: Person[]; groups: Group[];
  friendships: string[][]; requests: FriendRequest[]; blocks: string[][]; draft?: Draft;
  notices: Notice[]; reports: { id: string; from: string; groupId: string; reason: string; time: number }[];
};
export const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const normalizePhone = (phone: string) => phone.replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7');
export const person = (s: State, userId: string) => s.people.find(p => p.id === userId)!;
export const isBlocked = (s: State, a: string, b: string) => a !== b && s.blocks.some(pair => pair.includes(a) && pair.includes(b));
export const areFriends = (s: State, a: string, b: string) => a !== b && !isBlocked(s, a, b) && s.friendships.some(pair => pair.includes(a) && pair.includes(b));
export const friendsOf = (s: State, userId = s.activeUserId) => s.people.filter(p => areFriends(s, userId, p.id));
export const active = (look: Look | undefined, now: number) => !!look && look.endedAt === undefined && now < look.startedAt + VOTING_MS;
export const canView = (s: State, group: Group, userId: string, now: number) => {
  const look = group.look;
  return !!look && (look.recipientIds || group.memberIds).includes(userId) && !isBlocked(s, userId, look.authorId) &&
    (userId === look.authorId ? now < look.startedAt + RETENTION_MS : active(look, now));
};
export function remaining(look: Look, now: number) {
  const seconds = Math.max(0, Math.ceil((look.startedAt + VOTING_MS - now) / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export const groupTitle = (s: State, g: Group) => g.memberIds.filter(p => p !== s.activeUserId).map(p => person(s, p)?.name.split(' ')[0]).filter(Boolean).join(', ') || 'Только вы';

export function seed(now = Date.now()): State {
  const people: Person[] = ['Мария', 'Аня Белова', 'Марк Орлов', 'Лена Волкова', 'Ира Соколова', 'Катя Миронова'].map((name, i) => ({
    id: ['maria', 'anna', 'mark', 'lena', 'ira', 'katya'][i], name,
    handle: ['maria', 'anna', 'mark', 'lena', 'ira', 'katya'][i],
    phone: `+7 000 000-00-0${i + 1}`, tone: ['#EEE8DE', '#E3C7B7', '#B9C7B5', '#D8C3A7', '#CDB9A8', '#CCD1D8'][i],
    contacts: [], notifications: true,
  }));
  return { version: 2, templates: [], history: [], signedIn: false, activeUserId: 'maria', people,
    groups: [{ id: 'close', ownerId: 'maria', memberIds: ['maria', 'anna', 'mark', 'lena'], look: {
      id: 'example', authorId: 'maria', photos: [{ id: 'example-photo', uri: 'demo', demo: true }],
      question: 'Как вам сочетание?', part: 'Весь образ', startedAt: now, hidden: false,
      votes: { anna: { value: 'like', updatedAt: now, changed: false }, mark: { value: 'dislike', updatedAt: now, changed: false } },
    } }, { id: 'family', ownerId: 'maria', memberIds: ['maria', 'ira', 'katya'] }],
    friendships: people.slice(1).map(p => ['maria', p.id]), requests: [], blocks: [], notices: [], reports: [],
  };
}

export type Action =
  | { type: 'login' } | { type: 'logout' } | { type: 'switch'; userId: string }
  | { type: 'register'; name: string; phone: string; avatar: Photo }
  | { type: 'profile'; name: string; phone: string; avatar?: Photo }
  | { type: 'notifications'; enabled: boolean } | { type: 'read-notices' }
  | { type: 'request'; to: string } | { type: 'resolve-request'; requestId: string; accept: boolean }
  | { type: 'cancel-request'; requestId: string } | { type: 'contacts'; userIds: string[] }
  | { type: 'template'; templateId: string; name: string; memberIds: string[] }
  | { type: 'delete-template'; templateId: string }
  | { type: 'group'; groupId: string; memberIds: string[] }
  | { type: 'invite'; groupId: string; memberIds: string[] }
  | { type: 'leave'; groupId: string; lookId?: string } | { type: 'block'; userId: string; blocked: boolean }
  | { type: 'draft'; draftId: string; groupId?: string; replace?: boolean; templateId?: string }
  | { type: 'draft-photo'; draftId: string; photo: Photo }
  | { type: 'draft-remove'; draftId: string; photoId: string }
  | { type: 'draft-details'; draftId: string; question: string; part: BodyPart; hidden?: boolean }
  | { type: 'draft-audience'; draftId: string; memberIds: string[] }
  | { type: 'discard-draft' } | { type: 'publish'; draftId: string; groupId: string; memberIds?: string[] }
  | { type: 'append'; groupId: string; lookId: string; photo: Photo }
  | { type: 'vote'; groupId: string; lookId: string; value: VoteValue }
  | { type: 'delete-look'; groupId: string; lookId?: string }
  | { type: 'report'; groupId: string; lookId?: string; reason: string } | { type: 'delete-profile' };

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function sweep(state: State, now: number): State {
  const s = structuredCopy(state);
  s.templates = s.templates || [];
  s.history = (s.history || []).filter(g => g.look && now < g.look.startedAt + RETENTION_MS);
  for (const group of [...s.groups, ...s.history]) {
    if (!group.look) continue;
    const look = group.look;
    if ((look.endedAt !== undefined || now >= look.startedAt + VOTING_MS) && !s.notices.some(n => n.id === `closed-${look.id}`)) {
      s.notices.unshift({ id: `closed-${look.id}`, userId: look.authorId, groupId: group.id, lookId: look.id,
        text: 'Голосование завершено. Результат доступен до часа с отправки.', time: look.endedAt ?? look.startedAt + VOTING_MS, read: false });
    }
    if (now >= look.startedAt + RETENTION_MS) delete group.look;
  }
  if (s.draft && now >= s.draft.createdAt + RETENTION_MS) delete s.draft;
  s.notices = s.notices.filter(n => now - n.time < 24 * RETENTION_MS).slice(0, 100);
  return s;
}
function structuredCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function apply(state: State, action: Action, now = Date.now()): State {
  const s = sweep(state, now);
  const me = s.activeUserId;
  const self = person(s, me);
  const group = 'groupId' in action ? s.groups.find(g => g.id === action.groupId) : undefined;
  const notice = (userId: string, text: string, g?: Group, respectSetting = false) => {
    if (!respectSetting || person(s, userId)?.notifications) s.notices.unshift({ id: id(), userId, text, groupId: g?.id, lookId: g?.look?.id, time: now, read: false });
  };
  const members = (values: string[]) => {
    const unique = [...new Set(values)].filter(v => v !== me);
    ensure(unique.length, 'Выберите хотя бы одного друга.');
    ensure(unique.every(v => areFriends(s, me, v)), 'Получателями могут быть только подтверждённые друзья.');
    return [me, ...unique];
  };
  switch (action.type) {
    case 'login': s.signedIn = true; break;
    case 'logout': s.signedIn = false; break;
    case 'switch': ensure(person(s, action.userId), 'Профиль недоступен.'); s.activeUserId = action.userId; break;
    case 'register': {
      validateProfile(s, action.name, action.phone);
      ensure(action.avatar && (action.avatar.demo || action.avatar.uri), 'Добавьте фотографию профиля.');
      const userId = id();
      let handle = `pr_${id().replace(/-/g, '')}`;
      while (s.people.some(p => p.handle === handle)) handle = `pr_${id().replace(/-/g, '')}`;
      s.people.push({ id: userId, handle, name: action.name.trim(), phone: `+${normalizePhone(action.phone)}`, avatar: action.avatar,
        tone: '#EEE8DE', contacts: [], notifications: true });
      s.registeredUserId = userId; s.activeUserId = userId; s.signedIn = true; break;
    }
    case 'profile': {
      validateProfile(s, action.name, action.phone, me);
      self.name = action.name.trim(); self.phone = `+${normalizePhone(action.phone)}`;
      if (action.avatar) self.avatar = action.avatar;
      break;
    }
    case 'notifications': self.notifications = action.enabled; break;
    case 'read-notices': s.notices.filter(n => n.userId === me).forEach(n => { n.read = true; }); break;
    case 'request': {
      ensure(action.to !== me && person(s, action.to), 'Нельзя добавить себя.');
      ensure(!isBlocked(s, me, action.to), 'Пользователь заблокирован.');
      if (areFriends(s, me, action.to) || s.requests.some(r => [r.from, r.to].includes(me) && [r.from, r.to].includes(action.to))) break;
      s.requests.push({ id: id(), from: me, to: action.to }); notice(action.to, `${self.name}: запрос в друзья.`); break;
    }
    case 'resolve-request': {
      const req = s.requests.find(r => r.id === action.requestId);
      ensure(req && req.to === me, 'Запрос больше недоступен.');
      if (action.accept && !isBlocked(s, me, req.from)) {
        if (!areFriends(s, me, req.from)) s.friendships.push([me, req.from]);
        notice(req.from, `${self.name} принял(а) запрос в друзья.`);
      }
      s.requests = s.requests.filter(r => r.id !== req.id); break;
    }
    case 'cancel-request': s.requests = s.requests.filter(r => !(r.id === action.requestId && r.from === me)); break;
    case 'contacts': {
      self.contacts = [...new Set(action.userIds)].filter(v => v !== me && person(s, v));
      for (const other of s.people.filter(p => self.contacts.includes(p.id))) {
        if (!areFriends(s, me, other.id) && !isBlocked(s, me, other.id)) {
          s.friendships.push([me, other.id]);
          s.requests = s.requests.filter(r => !([r.from, r.to].includes(me) && [r.from, r.to].includes(other.id)));
        }
      }
      break;
    }
    case 'template': {
      const existing = s.templates.find(t => t.id === action.templateId);
      ensure(!existing || existing.ownerId === me, 'Шаблон меняет только его создатель.');
      const name = action.name.trim();
      ensure(name.length >= 1 && name.length <= 40, 'Название шаблона — от 1 до 40 символов.');
      ensure(!s.templates.some(t => t.ownerId === me && t.id !== action.templateId && t.name.toLocaleLowerCase() === name.toLocaleLowerCase()), 'Шаблон с таким названием уже есть.');
      const memberIds = members(action.memberIds).filter(v => v !== me);
      if (existing) { existing.name = name; existing.memberIds = memberIds; }
      else s.templates.push({ id: action.templateId, ownerId: me, name, memberIds });
      break;
    }
    case 'delete-template': {
      ensure(s.templates.some(t => t.id === action.templateId && t.ownerId === me), 'Шаблон недоступен.');
      s.templates = s.templates.filter(t => t.id !== action.templateId); break;
    }
    case 'group': {
      const memberIds = members(action.memberIds);
      if (group) { ensure(group.ownerId === me, 'Состав меняет только создатель.'); ensure(!active(group.look, now), 'Изменить состав можно после завершения примерки.'); if (group.look && !group.look.recipientIds) group.look.recipientIds = [...group.memberIds]; group.memberIds = memberIds; }
      else s.groups.push({ id: action.groupId, ownerId: me, memberIds });
      break;
    }
    case 'leave': {
      const event = findEvent(s, action.groupId, action.lookId);
      ensure(event && (event.look?.recipientIds || event.memberIds).includes(me), 'Событие недоступно.');
      ensure(event.ownerId !== me, 'Создатель сохраняет своё событие.');
      event.memberIds = event.memberIds.filter(v => v !== me);
      if (event.look) {
        event.look.recipientIds = (event.look.recipientIds || event.memberIds).filter(v => v !== me);
        delete event.look.votes[me];
      }
      break;
    }
    case 'invite': {
      ensure(group?.ownerId === me && active(group.look, now), 'Приглашать можно только в свою активную примерку.');
      const added = members(action.memberIds).filter(v => !group.memberIds.includes(v));
      if (group.look && !group.look.recipientIds) group.look.recipientIds = [...group.memberIds];
      for (const userId of added) { group.memberIds.push(userId); group.look?.recipientIds?.push(userId); notice(userId, `${self.name} просит оценить образ.`, group, true); }
      break;
    }
    case 'block': {
      ensure(action.userId !== me && person(s, action.userId), 'Пользователь недоступен.');
      if (action.blocked) {
        if (!s.blocks.some(pair => pair[0] === me && pair[1] === action.userId)) s.blocks.push([me, action.userId]);
        s.requests = s.requests.filter(r => !([r.from, r.to].includes(me) && [r.from, r.to].includes(action.userId)));
      } else s.blocks = s.blocks.filter(pair => !(pair[0] === me && pair[1] === action.userId));
      break;
    }
    case 'draft': {
      ensure(!s.draft, 'Сначала завершите или удалите текущий черновик на главном экране.');
      if (action.groupId) {
        ensure(group?.ownerId === me, 'Новый образ создаёт автор чата.');
        ensure(!active(group.look, now) || action.replace, 'Подтвердите завершение текущего голосования.');
        if (group.look) {
          const previous = structuredCopy(group);
          previous.look!.endedAt = Math.min(now, previous.look!.startedAt + VOTING_MS);
          s.history.push(previous);
          delete group.look;
        }
      }
      const template = action.templateId ? s.templates.find(t => t.id === action.templateId && t.ownerId === me) : undefined;
      ensure(!action.templateId || template, 'Шаблон недоступен.');
      const recipients = template?.memberIds.filter(v => areFriends(s, me, v));
      ensure(!template || recipients?.length, 'В шаблоне нет доступных друзей. Измените состав шаблона.');
      s.draft = { memberIds: recipients, id: action.draftId, authorId: me, groupId: action.groupId, photos: [], question: '', part: 'Весь образ', hidden: false, createdAt: now }; break;
    }
    case 'draft-photo':
    case 'draft-remove':
    case 'draft-audience':
    case 'draft-details': {
      const d = s.draft;
      ensure(d && d.authorId === me && d.id === action.draftId, 'Черновик больше недоступен.');
      if (action.type === 'draft-photo') { ensure(d.photos.length < 3, 'Максимум три фотографии.'); if (!d.photos.some(p => p.id === action.photo.id)) d.photos.push(action.photo); }
      if (action.type === 'draft-remove') d.photos = d.photos.filter(p => p.id !== action.photoId);
      if (action.type === 'draft-audience') d.memberIds = [...new Set(action.memberIds)].filter(v => areFriends(s, me, v));
      if (action.type === 'draft-details') { ensure(action.question.length <= 100, 'Подпись — до 100 символов.'); d.question = action.question; d.part = action.part; if (action.hidden !== undefined) d.hidden = action.hidden; }
      break;
    }
    case 'discard-draft': ensure(s.draft?.authorId === me, 'Черновик недоступен.'); delete s.draft; break;
    case 'publish': {
      const d = s.draft;
      ensure(d && d.id === action.draftId && d.authorId === me && d.photos.length > 0, 'Сначала снимите образ.');
      ensure(d.photos.length <= 3, 'Максимум три фотографии.');
      ensure(!d.groupId || d.groupId === action.groupId, 'Получатели черновика изменились.');
      let target = group;
      if (!target) { target = { id: action.groupId, ownerId: me, memberIds: members(action.memberIds || []) }; s.groups.push(target); }
      ensure(target.ownerId === me && !active(target.look, now), 'Этот чат уже содержит активный образ.');
      ensure(target.memberIds.some(v => v !== me && !isBlocked(s, me, v)), 'Нет доступных получателей.');
      const firstLook = !d.groupId;
      target.look = { id: id(), authorId: me, photos: d.photos, question: d.question, part: d.part, startedAt: now, votes: {}, recipientIds: [...target.memberIds], hidden: !!d.hidden };
      if (firstLook) target.memberIds.filter(v => v !== me && !isBlocked(s, me, v)).forEach(v => notice(v, `${self.name} просит оценить образ.`, target, true));
      delete s.draft; break;
    }
    case 'append': {
      ensure(group?.look?.id === action.lookId && group.look.authorId === me, 'Образ недоступен.');
      ensure(active(group.look, now), '15 минут закончились. Начните новый образ.');
      if (group.look.photos.some(p => p.id === action.photo.id)) break;
      ensure(group.look.photos.length < 3, 'Максимум три фотографии.');
      group.look.photos.push(action.photo);
      (group.look.recipientIds || group.memberIds)
        .filter(userId => userId !== me && canView(s, group, userId, now))
        .forEach(userId => notice(userId, `${self.name} добавил(а) новое фото к примерке.`, group, true));
      break;
    }
    case 'vote': {
      ensure(group?.look?.id === action.lookId && canView(s, group, me, now), 'Примерка больше недоступна.');
      ensure(group.look.authorId !== me, 'Автор не оценивает свой образ.');
      ensure(active(group.look, now), 'Голосование завершено.');
      const previous = group.look.votes[me];
      if (previous?.value === action.value) break;
      group.look.votes[me] = { value: action.value, updatedAt: now, changed: !!previous };
      notice(group.look.authorId, `${self.name} ${previous ? 'изменил(а) оценку' : 'поставил(а) оценку'}: ${action.value === 'like' ? 'нравится' : 'не нравится'}.`, group, true);
      break;
    }
    case 'delete-look': {
      const event = findEvent(s, action.groupId, action.lookId);
      ensure(event?.ownerId === me, 'Образ удаляет только автор.');
      if (event === group) delete group.look;
      else s.history = s.history.filter(g => g !== event);
      break;
    }
    case 'report': {
      const event = findEvent(s, action.groupId, action.lookId);
      ensure(event && canView(s, event, me, now), 'Образ недоступен.');
      s.reports.push({ id: id(), from: me, groupId: event.id, reason: action.reason, time: now }); break;
    }
    case 'delete-profile': {
      s.templates = s.templates.filter(t => t.ownerId !== me).map(t => ({ ...t, memberIds: t.memberIds.filter(v => v !== me) }));
      s.groups = s.groups.filter(g => g.ownerId !== me).map(g => ({ ...g, memberIds: g.memberIds.filter(v => v !== me), look: g.look ? { ...g.look, recipientIds: g.look.recipientIds?.filter(v => v !== me), votes: Object.fromEntries(Object.entries(g.look.votes).filter(([v]) => v !== me)) } : undefined }));
      s.history = s.history.filter(g => g.ownerId !== me).map(g => ({ ...g, memberIds: g.memberIds.filter(v => v !== me), look: g.look ? { ...g.look, recipientIds: g.look.recipientIds?.filter(v => v !== me), votes: Object.fromEntries(Object.entries(g.look.votes).filter(([v]) => v !== me)) } : undefined }));
      if (s.registeredUserId === me) delete s.registeredUserId;
      s.friendships = s.friendships.filter(p => !p.includes(me)); s.requests = s.requests.filter(r => r.from !== me && r.to !== me);
      s.blocks = s.blocks.filter(p => !p.includes(me)); s.notices = s.notices.filter(n => n.userId !== me);
      s.reports = s.reports.filter(r => r.from !== me); if (s.draft?.authorId === me) delete s.draft;
      s.people = s.people.filter(p => p.id !== me).map(p => ({ ...p, contacts: p.contacts.filter(v => v !== me) }));
      if (!s.people.length) return { ...seed(now), groups: [], friendships: [] };
      s.activeUserId = s.people[0].id; s.signedIn = false; break;
    }
  }
  s.notices = s.notices.slice(0, 100);
  return s;
}


function validateProfile(s: State, name: string, phone: string, me?: string) {
  ensure(name.trim().length >= 2 && name.trim().length <= 40, 'Имя должно содержать от 2 до 40 символов.');
  const normalized = normalizePhone(phone);
  ensure(/^7\d{10}$/.test(normalized), 'Введите российский номер: +7 и ещё 10 цифр.');
  ensure(!s.people.some(p => p.id !== me && normalizePhone(p.phone) === normalized), 'Этот номер уже используется локальным профилем.');
}

export function migrate(raw: State | (Omit<State, 'version' | 'history'> & { version: 1; history?: Group[] })): State {
  ensure(raw.version === 1 || raw.version === 2, 'Неизвестная версия локальных данных.');
  const next = structuredCopy(raw);
  return { ...next, version: 2, templates: next.templates || [], history: next.history || [] };
}
export function findEvent(s: State, groupId: string, lookId?: string) {
  const current = s.groups.find(g => g.id === groupId);
  if (!lookId || current?.look?.id === lookId) return current;
  return s.history.find(g => g.id === groupId && g.look?.id === lookId);
}
export function visibleEvents(s: State, userId: string, now: number) {
  return [...s.groups, ...s.history].filter(g => canView(s, g, userId, now)).sort((a, b) => b.look!.startedAt - a.look!.startedAt);
}
export function eventAudience(s: State, g: Group, userId: string, now: number) {
  if (!canView(s, g, userId, now)) return undefined;
  const look = g.look!;
  if (look.hidden && userId !== look.authorId) return { memberIds: [look.authorId, userId], votes: look.votes[userId] ? { [userId]: look.votes[userId] } : {} };
  return { memberIds: look.recipientIds || g.memberIds, votes: look.votes };
}

// Phone-book labels are deliberately ignored: the registered profile is authoritative.
export function matchContactNumbers(s: State, numbers: string[], userId = s.activeUserId) {
  const normalized = new Set(numbers.map(normalizePhone).filter(n => /^7\d{10}$/.test(n)));
  return s.people.filter(p => p.id !== userId && !isBlocked(s, userId, p.id) && normalized.has(normalizePhone(p.phone)));
}

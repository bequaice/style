import { useEffect, useState } from 'react';
import { Platform, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { areFriends, friendsOf, isBlocked, normalizePhone, person, matchContactNumbers, type Photo } from '../../domain/model';
import { useStore } from '../../state/Store';
import { Avatar, Button, Confirm, Empty, Field, Muted, Nav, Page, Tap, Title } from '../UI';
import { AvatarPicker } from '../AvatarPicker';
import { savePhoto } from '../../services/photos';
import { styles as s } from '../styles';

export function Friends() {
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [contactsMessage, setContactsMessage] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const me = state.activeUserId;
  const incoming = state.requests.filter(r => r.to === me);
  const outgoing = state.requests.filter(r => r.from === me);
  const q = query.trim().replace(/^@/, '').toLowerCase();
  const found = searched && q ? state.people.filter(p => p.handle === q || (normalizePhone(q).length === 11 && normalizePhone(p.phone) === normalizePhone(q))) : [];
  const readContacts = async () => {
    if (Platform.OS === 'web') { setContactsMessage('Телефонная книга доступна в мобильной сборке. В браузере используйте поиск по ID или номеру.'); return; }
    setLoadingContacts(true);
    try {
      const contacts = await import('expo-contacts');
      const permission = await contacts.requestPermissionsAsync();
      if (!permission.granted) { setContactsMessage('Доступ к контактам не предоставлен. Поиск по ID и номеру по-прежнему работает.'); return; }
      const details = await contacts.Contact.getAllDetails([contacts.ContactField.PHONES]);
      const numbers = new Set(details.flatMap(c => c.phones?.map(p => normalizePhone(p.number || '')) || []));
      const matched = matchContactNumbers(state, [...numbers]);
      await dispatch({ type: 'contacts', userIds: matched.map(p => p.id) });
      setContactsMessage(matched.length ? `Найдено тестовых профилей: ${matched.length}. Все найденные пользователи добавлены в друзья. Имена и фото взяты из их профилей.` : 'Совпадений с тестовыми профилями нет. Поиск настоящих пользователей станет доступен после подключения сервера.');
    } catch { setContactsMessage('Не удалось прочитать контакты. Проверьте разрешение в настройках телефона.'); }
    finally { setLoadingContacts(false); }
  };
  const unread = state.notices.filter(n => n.userId === me && !n.read).length;
  return <Page back={false} footer={<Nav screen="friends" unread={unread} />}><Title subtitle="Все зарегистрированные знакомые из телефонной книги автоматически становятся друзьями.">Друзья</Title>
    <Text style={s.sectionTitle}>Добавить друга</Text>
    <Field label="ID или номер телефона" value={query} onChangeText={text => { setQuery(text); setSearched(false); }} placeholder="Например, @anna" />
    <Button label="Найти человека" disabled={!q} onPress={() => setSearched(true)} />
    {searched && !found.length && <Muted>Пользователь не найден. Здесь доступны только тестовые профили.</Muted>}
    {found.map(p => {
      const incomingReq = incoming.find(r => r.from === p.id);
      const sent = outgoing.some(r => r.to === p.id);
      return <View key={p.id} style={{ paddingVertical: 18 }}><View style={s.listRow}><Avatar who={p} /><View style={s.listGrow}><Text style={s.listTitle}>{p.name}</Text><Text style={s.listMeta}>@{p.handle} · {p.phone || 'Номер не указан'}</Text></View></View>
        {p.id === me ? <Muted>Это вы. Добавить себя нельзя.</Muted> : isBlocked(state, me, p.id) ? <Muted>Пользователь заблокирован.</Muted> : areFriends(state, me, p.id) ? <Muted>Уже в друзьях.</Muted> : incomingReq ? <Button label="Принять запрос" onPress={() => { void dispatch({ type: 'resolve-request', requestId: incomingReq.id, accept: true }); }} /> : <Button label={sent ? 'Запрос отправлен' : 'Добавить в друзья'} disabled={sent} onPress={() => { void dispatch({ type: 'request', to: p.id }); }} />}
      </View>;
    })}
    <Button label={loadingContacts ? 'Читаем контакты…' : 'Найти в телефонной книге'} disabled={loadingContacts} light onPress={() => { void readContacts(); }} />
    {!!contactsMessage && <Muted>{contactsMessage}</Muted>}
    {!!incoming.length && <Text style={s.sectionTitle}>Входящие запросы</Text>}
    {incoming.map(r => <View key={r.id}><Text style={[s.listTitle, { marginTop: 18 }]}>{person(state, r.from).name}</Text><View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button label="Принять" small onPress={() => { void dispatch({ type: 'resolve-request', requestId: r.id, accept: true }); }} /></View><View style={{ flex: 1 }}><Button label="Отклонить" light small onPress={() => { void dispatch({ type: 'resolve-request', requestId: r.id, accept: false }); }} /></View></View></View>)}
    {!!outgoing.length && <Text style={s.sectionTitle}>Ожидают ответа</Text>}
    {outgoing.map(r => <View key={r.id} style={s.listRow}><Text style={[s.listTitle, s.listGrow]}>{person(state, r.to).name}</Text><Button label="Отменить" light small onPress={() => { void dispatch({ type: 'cancel-request', requestId: r.id }); }} /></View>)}
    <Text style={s.sectionTitle}>Друзья · {friendsOf(state).length}</Text>
    {!friendsOf(state).length && <Empty title="Соберите свой круг">Отправьте запрос. Для проверки перейдите в профиль получателя и примите его.</Empty>}
    {friendsOf(state).map(p => <View key={p.id}><View style={s.listRow}><Avatar who={p} /><View style={s.listGrow}><Text style={s.listTitle}>{p.name}</Text><Text style={s.listMeta}>{p.phone} · @{p.handle}</Text></View></View>
      <Confirm label={`Заблокировать: ${p.name.split(' ')[0]}`} title="Заблокировать пользователя?" message="Он не сможет получать ваши образы или приглашать вас. Восстановить доступ можно в профиле." onConfirm={() => dispatch({ type: 'block', userId: p.id, blocked: true })} /></View>)}
    <Muted>Запросы и подтверждения в этой версии работают между тестовыми профилями на одном устройстве.</Muted>
  </Page>;
}

export function Profile() {
  const { state, dispatch } = useStore();
  const me = person(state, state.activeUserId);
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState<Photo | undefined>(me.avatar);
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const save = async () => {
    setSaving(true); setPhotoError('');
    try {
      const stored = avatar && avatar.uri !== me.avatar?.uri ? savePhoto(avatar.uri) : avatar;
      const ok = await dispatch({ type: 'profile', name, phone, avatar: stored });
      setSaved(ok);
    } catch { setPhotoError('Не удалось сохранить фотографию. Попробуйте ещё раз.'); }
    finally { setSaving(false); }
  };
  const [phone, setPhone] = useState(me.phone);
  const [saved, setSaved] = useState(false);
  const unread = state.notices.filter(n => n.userId === me.id && !n.read).length;
  return <Page back={false} footer={<Nav screen="profile" unread={unread} />}><Title subtitle="Ваш локальный профиль и настройки.">Это вы</Title>
    <View style={s.listRow}><Avatar who={me} size={64} /><View><Text style={s.listTitle}>{me.name}</Text><Text style={s.listMeta}>@{me.handle}</Text></View></View>
    <Field label="Имя" value={name} maxLength={40} onChangeText={v => { setName(v); setSaved(false); }} />
    <AvatarPicker photo={avatar} onChange={photo => { setAvatar(photo); setSaved(false); }} />
    <Text style={s.listMeta}>ID: @{me.handle} · присвоен автоматически</Text>
    <Field label="Номер телефона" value={phone} keyboardType="phone-pad" maxLength={20} onChangeText={v => { setPhone(v); setSaved(false); }} />
    <Button label={saving ? 'Сохраняем…' : saved ? 'Профиль сохранён' : 'Сохранить профиль'} disabled={saving} onPress={() => { void save(); }} />
    {!!photoError && <Muted>{photoError}</Muted>}
    <Muted>Ваше имя, фото и номер видны другим пользователям. Изменять их можете только вы. ID изменить нельзя.</Muted>
    <View style={[s.listRow, { marginTop: 16 }]}><View style={s.listGrow}><Text style={s.listTitle}>События о примерках</Text><Text style={s.listMeta}>Внутри приложения, без push</Text></View><Switch accessibilityLabel="События о примерках" value={me.notifications} onValueChange={enabled => { void dispatch({ type: 'notifications', enabled }); }} trackColor={{ true: '#F21820' }} /></View>
    <Text style={s.sectionTitle}>Проверка с другой стороны</Text>
    <Muted>Это переключатель тестовых ролей. Вы увидите то же событие как его автор или приглашённый участник.</Muted>
    {state.people.map(p => <Tap key={p.id} label={`Открыть как ${p.name}`} onPress={() => { void dispatch({ type: 'switch', userId: p.id }).then(ok => { if (ok) router.replace('/events'); }); }}><View style={s.listRow}><Avatar who={p} /><View style={s.listGrow}><Text style={s.listTitle}>{p.name}{p.id === me.id ? ' · сейчас' : ''}</Text><Text style={s.listMeta}>{p.phone} · @{p.handle}</Text></View><Text style={s.chevron}>›</Text></View></Tap>)}
    {state.blocks.some(pair => pair[0] === me.id) && <Text style={s.sectionTitle}>Заблокированные</Text>}
    {state.blocks.filter(pair => pair[0] === me.id).map(([, userId]) => <View key={userId} style={s.listRow}><Text style={[s.listTitle, s.listGrow]}>{person(state, userId).name}</Text><Button label="Вернуть" light small onPress={() => { void dispatch({ type: 'block', userId, blocked: false }); }} /></View>)}
    <Muted>Участникам событие доступно только во время голосования — 15 минут. Автор видит снимки и результаты до часа с отправки. После истечения срока они удаляются при следующем открытии приложения или во время его работы. Телефон и ID здесь не проходят серверную проверку.</Muted>
    <Button label="Выйти" light onPress={() => { void dispatch({ type: 'logout' }).then(ok => { if (ok) router.replace('/'); }); }} />
    <Confirm label="Удалить локальный профиль" title="Удалить профиль?" message="Ваши локальные события, снимки, оценки и связи будут удалены с этого устройства. Это действие нельзя отменить." danger onConfirm={async () => { if (await dispatch({ type: 'delete-profile' })) router.replace('/'); }} />
  </Page>;
}

export function Notifications() {
  const { state, dispatch } = useStore();
  useEffect(() => { void dispatch({ type: 'read-notices' }); }, [dispatch]);
  const notices = state.notices.filter(n => n.userId === state.activeUserId);
  return <Page back={false} footer={<Nav screen="notifications" unread={0} />}><Title subtitle="Приглашения, новые фото и оценки ваших образов.">Уведомления</Title>
    {!notices.length && <Empty title="Пока спокойно">Новые события появятся здесь. Push-уведомления подключим вместе с сервером.</Empty>}
    {notices.map(n => <Tap key={n.id} label={n.text} onPress={() => {
      if (n.groupId) router.push({ pathname: '/chat', params: { groupId: n.groupId, lookId: n.lookId || '', noticeLookId: n.lookId || '' } }); else router.push('/friends');
    }}><View style={[s.chatCard, { marginTop: 12 }]}><Text style={{ fontSize: 17, lineHeight: 24 }}>{n.text}</Text><Text style={s.listMeta}>{new Date(n.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</Text></View></Tap>)}
    {state.reports.some(r => r.from === state.activeUserId) && <><Text style={s.sectionTitle}>Ваши жалобы</Text><Muted>Сохранены на устройстве. Модератор пока их не получает.</Muted>{state.reports.filter(r => r.from === state.activeUserId).map(r => <View key={r.id} style={s.listRow}><Text>{r.reason} · {new Date(r.time).toLocaleDateString('ru-RU')}</Text></View>)}</>}
  </Page>;
}

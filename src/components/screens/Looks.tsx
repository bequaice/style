import { useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { active, canView, eventAudience, findEvent, groupTitle, id, isBlocked, person, remaining, RETENTION_MS, visibleEvents } from '../../domain/model';
import { useClock, useStore } from '../../state/Store';
import { Avatar, Button, Confirm, Empty, groupRoute, Muted, Nav, Page, PhotoImage, Tap, Title } from '../UI';
import { styles as s, red } from '../styles';

function EventList({ invited = false }: { invited?: boolean }) {
  const { state, dispatch } = useStore();
  const now = useClock();
  const me = state.activeUserId;
  const unread = state.notices.filter(n => n.userId === me && !n.read).length;
  const events = visibleEvents(state, me, now).filter(g => invited ? g.ownerId !== me : g.ownerId === me);
  const circles = state.groups.filter(g => g.ownerId === me);
  const begin = async (templateId?: string) => { if (await dispatch({ type: 'draft', draftId: id(), templateId })) router.push('/camera'); };
  return <Page back={false} footer={<Nav screen={invited ? 'events' : 'home'} unread={unread} />}>
    <Title subtitle={invited ? 'Образы, которые знакомые отправили вам на оценку.' : `Вы — ${person(state, me).name}`}>{invited ? 'События' : 'Мои примерки'}</Title>
    {!invited && (state.draft?.authorId === me ? <><Button label={`Продолжить черновик · ${state.draft.photos.length} фото`} onPress={() => router.push('/camera')} />
      <Confirm label="Удалить черновик" title="Удалить черновик?" message="Неотправленные фотографии будут удалены с устройства." danger onConfirm={() => dispatch({ type: 'discard-draft' })} /></> :
      state.draft ? <Muted>Есть неотправленный образ участника {person(state, state.draft.authorId).name}. Переключитесь на его профиль, чтобы продолжить.</Muted> : <Button label="Новая примерка" onPress={() => { void begin(); }} />)}
    <Text style={s.eyebrow}>{invited ? 'ВАС ПРИГЛАСИЛИ' : 'ВАШИ ОБРАЗЫ'}</Text>
    {!events.length && <Empty title={invited ? 'Пока нет приглашений' : 'Пока нет примерок'}>{invited ? 'Приглашения появятся здесь и в уведомлениях.' : 'Снимите образ и выберите знакомых, чьему мнению доверяете.'}</Empty>}
    {events.map(g => {
      const look = g.look!;
      const author = person(state, look.authorId);
      return <Tap key={look.id} label={`Открыть событие: ${author.name}`} onPress={() => router.push(groupRoute(g.id, look.id))}>
        <View style={[s.chatCard, { marginTop: 12 }]}><View style={s.chatCardTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}><Avatar who={author} /><Text style={[s.listTitle, { flex: 1 }]}>{author.name}</Text></View>
          <View style={[s.timerPill, !active(look, now) && { backgroundColor: '#70695E' }]}><Text style={s.timerText}>{active(look, now) ? remaining(look, now) : 'Завершено'}</Text></View>
        </View><Text style={[s.cardTitle, { fontSize: 25 }]}>{look.question || 'Как вам образ?'}</Text>
          <View style={{ height: 180, overflow: 'hidden', borderRadius: 6, marginTop: 12 }}><PhotoImage photo={look.photos[0]} /></View>
          <Text style={s.cardMeta}>{look.part} · {new Date(look.startedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</Text>
          <View style={s.cardAction}><Text style={s.cardActionText}>{active(look, now) ? invited ? 'Оценить образ' : 'Открыть примерку' : 'Посмотреть событие'}</Text><Text style={s.redArrow}>↗</Text></View>
        </View>
      </Tap>;
    })}
    {!invited && <><Text style={s.sectionTitle}>Шаблоны получателей</Text>{state.templates.filter(t => t.ownerId === me).map(t => <View key={t.id} style={{ marginBottom: 12 }}><Button label={`Новая примерка · ${t.name}`} light disabled={!!state.draft} onPress={() => { void begin(t.id); }} /><Button label={`Изменить шаблон «${t.name}»`} light small onPress={() => router.push({ pathname: '/new-group', params: { templateId: t.id } })} /></View>)}<Button label="Создать шаблон" light onPress={() => router.push('/new-group')} /></>}
    {!invited && !!circles.length && <><Text style={s.sectionTitle}>Сохранённые получатели</Text>{circles.map(g => <Button key={g.id} label={groupTitle(state, g)} light small onPress={() => router.push(groupRoute(g.id))} />)}</>}
    <Muted>Участники видят событие только во время голосования — 15 минут. Автор видит его до часа с отправки.</Muted>
  </Page>;
}
export function Home() { return <EventList />; }
export function Events() { return <EventList invited />; }

export function Chat() {
  const { state, dispatch } = useStore();
  const { groupId = 'close', lookId, noticeLookId } = useLocalSearchParams<{ groupId: string; lookId?: string; noticeLookId?: string }>();
  const group = findEvent(state, groupId, lookId);
  const now = useClock();
  const [selected, setSelected] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [editingVote, setEditingVote] = useState(false);
  const me = state.activeUserId;
  const availableGroup = (group?.look?.recipientIds || group?.memberIds)?.includes(me) && !isBlocked(state, me, group.ownerId);
  if (!group || !availableGroup) return <Page><Empty title="Событие недоступно">Возможно, вы вышли из события или заблокировали его создателя.</Empty><Button label="К примеркам" onPress={() => router.replace('/home')} /></Page>;
  const look = canView(state, group, me, now) ? group.look : undefined;
  const own = group.ownerId === me;
  if (!own && !look) return <Page><Empty title="Примерка больше недоступна">Голосование завершено. Участники видят событие только пока идёт голосование — не более 15 минут с отправки.</Empty><Button label="К событиям" onPress={() => router.replace('/events')} /></Page>;
  const audience = eventAudience(state, group, me, now);
  const showAudience = !!look && (own || !look.hidden);
  const current = state.groups.some(g => g === group);
  const live = active(look, now);
  const vote = look?.votes[me];
  const photo = look?.photos[Math.min(selected, look.photos.length - 1)];
  const newLook = async () => {
    if (await dispatch({ type: 'draft', draftId: id(), groupId: group.id, replace: true })) router.push('/camera');
  };
  if (noticeLookId && look?.id !== noticeLookId) return <Page><Empty title="Примерка больше недоступна">Образ из этого уведомления завершён, удалён или заменён новым.</Empty><Button label="К текущему событию" onPress={() => router.replace(groupRoute(groupId))} /></Page>;
  return <Page><View style={[s.listRow, { borderBottomWidth: 0 }]}><Avatar who={person(state, group.ownerId)} size={58} /><View style={s.listGrow}><Text style={s.listTitle}>{person(state, group.ownerId).name}</Text><Text style={s.listMeta}>{person(state, group.ownerId).phone}</Text><Text style={s.listMeta}>@{person(state, group.ownerId).handle}</Text></View></View>
    {showAudience && <Tap label="Посмотреть участников" onPress={() => router.push({ pathname: '/participants', params: { groupId, lookId: look!.id } })}><Text style={s.memberLink}>Участники ›</Text></Tap>}
    {!!look?.hidden && <Muted>{own ? 'Участники и оценки скрыты от получателей.' : 'Участники и чужие оценки скрыты автором.'}</Muted>}
    {look && photo ? <>
      <View style={s.liveRow}><View style={[s.redDot, !live && { backgroundColor: '#777' }]} /><Text style={s.liveText}>{live ? `Голосование · ${remaining(look, now)}` : 'Голосование завершено'}</Text></View>
      <Tap label="Открыть фотографию целиком" onPress={() => setFullscreen(true)}><View style={s.photoFrame}><PhotoImage photo={photo} />
        <View style={s.photoCounter}><Text style={s.photoCounterText}>{Math.min(selected + 1, look.photos.length)} / {look.photos.length}</Text></View></View></Tap>
      {look.photos.length > 1 && <View style={s.chipRow}>{look.photos.map((p, i) => <Tap key={p.id} label={`Ракурс ${i + 1}`} onPress={() => setSelected(i)}><View style={{ borderWidth: 2, borderColor: photo.id === p.id ? red : 'transparent', borderRadius: 7 }}><PhotoImage photo={p} thumb /></View></Tap>)}</View>}
      <Text style={s.question}>{look.question || 'Как вам образ?'}</Text><Text style={s.author}>{person(state, look.authorId).name} · {look.part}{photo.demo ? ' · тестовое фото' : ''}</Text>
      {showAudience && <>
        <Text style={s.sectionTitle}>Оценки знакомых</Text>
        {Object.keys(audience?.votes || {}).length === 0 && <Muted>Оценок пока нет.</Muted>}
        {(audience?.memberIds || []).filter(v => v !== look.authorId && !!person(state, v) && !isBlocked(state, me, v)).map(userId => {
          const v = audience?.votes[userId];
          return <View style={s.listRow} key={userId}><Avatar who={person(state, userId)} /><View style={s.listGrow}><Text style={s.listTitle}>{person(state, userId).name}</Text>
            <Text style={[s.listMeta, v?.changed && { color: red }]}>{v ? `${v.changed ? 'Оценка изменилась · ' : ''}${v.value === 'like' ? 'Нравится ♡' : 'Не нравится ×'}` : live ? 'Ещё не оценил(а)' : 'Без оценки'}</Text></View></View>;
        })}
      </>}
      {own ? <>
        <Muted>{live ? 'За свой образ голосовать нельзя.' : `Событие доступно ещё ${Math.max(0, Math.ceil((look.startedAt + RETENTION_MS - now) / 60000))} мин.`}</Muted>
        {live && current && <Button label={`Добавить фото · ${look.photos.length}/3`} light disabled={look.photos.length >= 3} onPress={() => router.push({ pathname: '/camera', params: { mode: 'append', groupId, lookId: look.id } })} />}
      </> : <>
        {vote && !editingVote ? <><View style={[s.error, { backgroundColor: '#EEE8DE' }]}><Text>Ваша оценка: {vote.value === 'like' ? 'нравится ♡' : 'не нравится ×'}</Text></View>
          <Button label="Изменить оценку" light disabled={!live} onPress={() => setEditingVote(true)} /></> : <View style={s.voteRow}>
          {(['like', 'dislike'] as const).map(value => <View key={value} style={{ flex: 1 }}><Button label={value === 'like' ? '♡ Нравится' : '× Не нравится'} light disabled={!live} onPress={() => {
            void dispatch({ type: 'vote', groupId, lookId: look.id, value }).then(ok => { if (ok) setEditingVote(false); });
          }} /></View>)}
        </View>}
        <Muted>{look.hidden ? 'Вашу оценку видит только автор. Чужие оценки скрыты.' : 'Ваша оценка и оценки других участников видны всем в событии.'}</Muted>
        <Confirm label="Пожаловаться на фото" title="Сохранить жалобу?" message="В этой версии жалоба сохраняется только на устройстве. После подключения сервера её сможет получить модератор." onConfirm={() => dispatch({ type: 'report', groupId, lookId: look.id, reason: 'Недопустимое содержание фото' })} />
      </>}
      <Muted>15 минут с отправки первого фото. Дополнительные снимки не продлевают голосование.</Muted>
    </> : <Empty title={own ? 'Начните новый образ' : 'Примерка больше недоступна'}>{own ? 'Круг друзей сохранён. Можно отправить им новый образ.' : 'Доступ участников заканчивается вместе с голосованием.'}</Empty>}
    {own && current && <>
      {state.draft?.authorId === me && state.draft.groupId === groupId ? <Button label="Продолжить новый образ" onPress={() => router.push('/camera')} /> : live ? <Confirm label="Новый образ" title="Начать новый образ?" message="Голосование за предыдущий образ завершится сразу. У участников он исчезнет, а у вас останется в истории до часа с его отправки. Новый таймер начнётся при отправке нового снимка." onConfirm={newLook} /> : <Button label="Новый образ" onPress={() => { void newLook(); }} />}
      <Button label={live ? 'Добавить участников' : 'Изменить участников'} light onPress={() => router.push({ pathname: '/new-group', params: { groupId, mode: live ? 'invite' : 'edit' } })} />
      
    </>}
    {!own && look && <>
      <Confirm label="Выйти из события" title="Выйти из события?" message="Фотографии и голосование станут вам недоступны." onConfirm={async () => { if (await dispatch({ type: 'leave', groupId, lookId: look.id })) router.replace('/events'); }} />
      <Confirm label="Заблокировать автора" title="Заблокировать автора?" message="Его события станут недоступны. Снять блокировку можно в профиле." onConfirm={async () => { if (await dispatch({ type: 'block', userId: group.ownerId, blocked: true })) router.replace('/events'); }} />
    </>}
    {own && look && <Confirm label="Удалить примерку" title="Удалить образ?" message="Фотографии, подпись и оценки исчезнут у всех." danger onConfirm={() => dispatch({ type: 'delete-look', groupId, lookId: look.id })} />}
    <Modal visible={fullscreen && !!photo} transparent onRequestClose={() => setFullscreen(false)}>
      <View style={[s.modalShade, { backgroundColor: '#151515', paddingVertical: 36 }]}><View style={{ flex: 1 }}>{photo && <PhotoImage photo={photo} full />}</View><Button label="Закрыть фото" onPress={() => setFullscreen(false)} /></View>
    </Modal>
  </Page>;
}

export function Participants() {
  const { state, dispatch } = useStore();
  const { groupId = 'close', lookId } = useLocalSearchParams<{ groupId: string; lookId?: string }>();
  const group = findEvent(state, groupId, lookId);
  const now = useClock();
  if (!(group?.look?.recipientIds || group?.memberIds)?.includes(state.activeUserId) || isBlocked(state, state.activeUserId, group.ownerId)) return <Page><Empty title="Событие недоступно" /></Page>;
  const own = group.ownerId === state.activeUserId;
  if (!group.look || !canView(state, group, state.activeUserId, now)) return <Page><Empty title="Событие больше недоступно" /></Page>;
  if (group.look.hidden && !own) return <Page><Empty title="Участники скрыты">Автор включил скрытие участников и оценок.</Empty></Page>;
  return <Page><Title subtitle="Имена и фотографии заданы самими пользователями. Текстовой переписки нет.">Участники</Title>
    {(group.look.recipientIds || group.memberIds).filter(userId => person(state, userId)).map(userId => <View style={s.listRow} key={userId}><Avatar who={person(state, userId)} /><View style={s.listGrow}><Text style={s.listTitle}>{person(state, userId).name}{userId === state.activeUserId ? ' · вы' : ''}</Text><Text style={s.listMeta}>{person(state, userId).phone}</Text><Text style={s.listMeta}>@{person(state, userId).handle}</Text></View></View>)}
    {!own && <>
      <Confirm label="Выйти из события" title="Выйти из события?" message="Образ и голосование этого события станут вам недоступны." onConfirm={async () => { if (await dispatch({ type: 'leave', groupId, lookId })) router.replace('/home'); }} />
      <Confirm label="Выйти и заблокировать автора" title="Заблокировать автора?" message="Его примерки будут скрыты, а новые приглашения заблокированы. Снять блокировку можно в профиле." onConfirm={async () => {
        if (await dispatch({ type: 'block', userId: group.ownerId, blocked: true })) { await dispatch({ type: 'leave', groupId, lookId }); router.replace('/home'); }
      }} />
    </>}
  </Page>;
}

import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { friendsOf, groupTitle, id, person } from '../../domain/model';
import { useStore } from '../../state/Store';
import { Avatar, Button, Confirm, Empty, Field, groupRoute, Muted, Page, Tap, Title } from '../UI';
import { styles as s } from '../styles';

export function NewGroup() {
  const { state, dispatch } = useStore();
  const { groupId, mode, draftId, templateId } = useLocalSearchParams<{ groupId?: string; mode?: string; draftId?: string; templateId?: string }>();
  const existing = state.groups.find(g => g.id === groupId);
  const template = state.templates.find(t => t.id === templateId && t.ownerId === state.activeUserId);
  const templateMode = !groupId && !draftId;
  const [templateName, setTemplateName] = useState(template?.name || '');
  const publish = !!draftId;
  const invite = mode === 'invite';
  const [selected, setSelected] = useState<string[]>(mode === 'edit' && existing ? existing.memberIds.filter(v => v !== state.activeUserId) : publish ? state.draft?.memberIds || [] : template?.memberIds || []);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const friends = friendsOf(state).filter(p => !invite || !existing?.memberIds.includes(p.id));
  const eligible = selected.filter(v => friends.some(p => p.id === v));
  const choose = (values: string[]) => {
    setSelected(values);
    if (publish) void dispatch({ type: 'draft-audience', draftId: draftId!, memberIds: values });
  };
  const toggle = (userId: string) => choose(selected.includes(userId) ? selected.filter(v => v !== userId) : [...selected, userId]);
  const save = async () => {
    setBusy(true);
    const targetId = groupId || id();
    const ok = await dispatch(templateMode ? { type: 'template', templateId: templateId || targetId, name: templateName, memberIds: eligible } : publish ? { type: 'publish', draftId: draftId!, groupId: targetId, memberIds: eligible } : invite ? { type: 'invite', groupId: targetId, memberIds: eligible } : { type: 'group', groupId: targetId, memberIds: eligible });
    setBusy(false);
    if (ok) router.replace(templateMode ? '/home' : groupRoute(targetId));
  };
  if (templateId && !template) return <Page><Empty title="Шаблон недоступен" /></Page>;
  if (groupId && (!existing || existing.ownerId !== state.activeUserId)) return <Page><Empty title="Чат недоступен" /></Page>;
  if (publish && (state.draft?.id !== draftId || state.draft.authorId !== state.activeUserId)) return <Page><Empty title="Черновик больше недоступен" /></Page>;
  return <Page><Title subtitle={publish ? 'Кому показать этот образ?' : invite ? 'Выберите новых получателей. Таймер останется прежним.' : 'Выберите людей, которым доверяете свой образ.'}>{templateMode ? template ? 'Изменить шаблон' : 'Новый шаблон' : invite ? 'Пригласить' : mode === 'edit' ? 'Ваш круг' : 'Соберите свой круг'}</Title>
    {templateMode && <Field label="Название шаблона" value={templateName} onChangeText={setTemplateName} maxLength={40} placeholder="Например, Семья" />}
    <Field label="Найти среди друзей" value={query} onChangeText={setQuery} placeholder="Имя или ID" />
    {!friends.length && <Empty title={invite ? 'Все друзья уже здесь' : 'Сначала добавьте друзей'}>Поиск по ID и номеру доступен во вкладке «Друзья».</Empty>}
    {friends.filter(p => `${p.name} ${p.handle}`.toLowerCase().includes(query.toLowerCase())).map(p => <Tap key={p.id} label={`${selected.includes(p.id) ? 'Убрать' : 'Выбрать'} ${p.name}`} onPress={() => toggle(p.id)}><View style={s.listRow}><Avatar who={p} /><Text style={[s.listTitle, s.listGrow]}>{p.name}</Text><View style={[s.checkbox, selected.includes(p.id) && s.checkboxSelected]}><Text style={s.check}>{selected.includes(p.id) ? '✓' : ''}</Text></View></View></Tap>)}
    {publish && !!state.templates.filter(t => t.ownerId === state.activeUserId).length && <><Text style={s.sectionTitle}>Шаблоны получателей</Text>{state.templates.filter(t => t.ownerId === state.activeUserId).map(t => <Button key={t.id} label={`Шаблон «${t.name}»`} light small onPress={() => choose(t.memberIds.filter(v => friends.some(p => p.id === v)))} />)}<Muted>Шаблон подставляет свой круг. Перед отправкой можно добавить или убрать людей.</Muted></>}
    {!groupId && state.groups.some(g => g.ownerId === state.activeUserId) && <><Text style={s.sectionTitle}>Выбрать из сохранённых</Text>{state.groups.filter(g => g.ownerId === state.activeUserId).map(g => <Button key={g.id} label={groupTitle(state, g)} light small onPress={() => choose([...new Set([...selected, ...g.memberIds.filter(v => v !== state.activeUserId && friends.some(p => p.id === v))])])} />)}</>}
    <Muted>Выбрано: {eligible.length}. {eligible.map(v => person(state, v).name.split(' ')[0]).join(', ')}</Muted>
    {publish && <View style={[s.chatCard, { marginTop: 20 }]}><Text style={s.listTitle}>Перед отправкой</Text><Muted>{state.draft!.photos.length} фото · {state.draft!.part}{state.draft!.question ? `\n${state.draft!.question}` : ''}</Muted><Muted>{state.draft!.hidden ? 'Участники и оценки скрыты от получателей.' : 'Участники и оценки видны всем приглашённым.'}</Muted><Muted>Голосование и доступ участников — 15 минут. Автор видит событие до часа с отправки. Затем оно удаляется. Повторяющиеся получатели учитываются один раз.</Muted></View>}
    <Button label={busy ? 'Сохраняем…' : publish ? 'Отправить на оценку' : invite ? 'Пригласить выбранных' : mode === 'edit' ? 'Сохранить участников' : 'Сохранить шаблон'} disabled={!eligible.length || busy || (templateMode && !templateName.trim())} onPress={() => { void save(); }} />
    {templateMode && template && <Confirm label="Удалить шаблон" title="Удалить шаблон?" message="Существующие события и друзья останутся. Удалится только сохранённый список получателей." onConfirm={async () => { if (await dispatch({ type: 'delete-template', templateId: template.id })) router.replace('/home'); }} />}
    {templateMode && <Muted>Название видно только вам. Шаблон сохраняется после удаления событий и не отправляет приглашений сам по себе.</Muted>}
    <Muted>Событие отображается под именем автора с его фотографией профиля. Текстовой переписки нет.</Muted>
  </Page>;
}

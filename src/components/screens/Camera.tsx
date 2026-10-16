import { useCallback, useRef, useState } from 'react';
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, Platform, Switch, Text, View } from 'react-native';
import { active, id, type BodyPart, type Photo } from '../../domain/model';
import { savePhoto } from '../../services/photos';
import { useClock, useStore } from '../../state/Store';
import { Button, Empty, Field, groupRoute, Muted, Page, PhotoImage, Tap, Title } from '../UI';
import { styles as s } from '../styles';

const parts: BodyPart[] = ['Весь образ', 'Верх', 'Низ', 'Обувь'];
export function Camera() {
  const { state, dispatch } = useStore();
  const { mode, groupId, lookId } = useLocalSearchParams<{ mode?: string; groupId?: string; lookId?: string }>();
  const append = mode === 'append';
  const draft = state.draft?.authorId === state.activeUserId ? state.draft : undefined;
  const look = state.groups.find(g => g.id === groupId)?.look;
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const captureLock = useRef(false);
  const [focused, setFocused] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [candidate, setCandidate] = useState<Photo | null>(null);
  const [review, setReview] = useState(!append && !!draft?.photos.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState(draft?.question || '');
  const [part, setPart] = useState<BodyPart>(draft?.part || 'Весь образ');
  const now = useClock();
  useFocusEffect(useCallback(() => { setFocused(true); return () => { setFocused(false); setReady(false); }; }, [setFocused, setReady]));
  const valid = append ? !!look && look.id === lookId && look.authorId === state.activeUserId && active(look, now) && look.photos.length < 3 : !!draft;
  const openCamera = async () => {
    setError('');
    try {
      const response = permission?.granted ? permission : await requestPermission();
      if (!response.granted) { setError('Нет доступа к камере. Разрешите его в настройках устройства или используйте тестовый снимок для проверки сценария.'); return; }
      setCameraStarted(true); setReview(false); setReady(false);
    } catch { setError('Камера недоступна. Проверьте разрешение браузера или устройства.'); }
  };
  const takePicture = async () => {
    if (!camera.current || !ready || captureLock.current) return;
    captureLock.current = true; setBusy(true); setError('');
    try {
      const picture: CameraCapturedPicture | undefined = await camera.current.takePictureAsync({ quality: 0.45, base64: Platform.OS === 'web' });
      if (!picture) throw new Error();
      setCandidate({ id: id(), uri: Platform.OS === 'web' && picture.base64 ? `data:image/jpeg;base64,${picture.base64}` : picture.uri });
      setReady(false);
    } catch { setError('Не удалось сделать снимок. Попробуйте ещё раз.'); }
    finally { captureLock.current = false; setBusy(false); }
  };
  const acceptPicture = async () => {
    if (!candidate || busy) return;
    setBusy(true); setError('');
    try {
      const photo = candidate.demo ? candidate : savePhoto(candidate.uri);
      const ok = await dispatch(append ? { type: 'append', groupId: groupId!, lookId: lookId!, photo } : { type: 'draft-photo', draftId: draft!.id, photo });
      if (ok) { setCandidate(null); setCameraStarted(false); if (append) router.replace(groupRoute(groupId!)); else setReview(true); }
    } catch { setError('Не удалось сохранить фото. Проверьте свободное место на устройстве.'); }
    finally { setBusy(false); }
  };
  const next = async () => {
    if (!draft || busy) return;
    setBusy(true);
    const ok = await dispatch({ type: 'draft-details', draftId: draft.id, question, part });
    if (ok) {
      if (draft.groupId) { if (await dispatch({ type: 'publish', draftId: draft.id, groupId: draft.groupId })) router.replace(groupRoute(draft.groupId)); }
      else router.push({ pathname: '/new-group', params: { draftId: draft.id } });
    }
    setBusy(false);
  };
  if (!valid) return <Page><Empty title={append ? 'Добавление недоступно' : 'Черновик недоступен'}>{append ? 'Голосование завершилось, образ заменён или уже добавлено три снимка.' : 'Начните новую примерку на главном экране. Черновик другого тестового участника открывается из его профиля.'}</Empty><Button label="К примеркам" onPress={() => router.replace('/home')} /></Page>;
  if (review && draft && !candidate) return <Page><Title subtitle="До трёх ракурсов одного образа. Таймер начнётся после отправки.">Новая примерка</Title>
    <View style={s.photoFrame}><PhotoImage photo={draft.photos[draft.photos.length - 1]} /></View>
    <View style={s.chipRow}>{draft.photos.map((p, i) => <View key={p.id}><PhotoImage photo={p} thumb /><Tap label={`Удалить ракурс ${i + 1}`} onPress={() => { void dispatch({ type: 'draft-remove', draftId: draft.id, photoId: p.id }).then(ok => { if (ok && draft.photos.length === 1) setReview(false); }); }}><Text style={{ textAlign: 'center', marginTop: 6 }}>Убрать ×</Text></Tap></View>)}</View>
    <Button label={`Ещё ракурс · ${draft.photos.length}/3`} light disabled={draft.photos.length >= 3} onPress={() => setReview(false)} />
    <Text style={[s.listTitle, { marginTop: 22 }]}>Что будем оценивать?</Text><View style={s.chipRow}>{parts.map(p => <Tap key={p} label={p} onPress={() => { setPart(p); void dispatch({ type: 'draft-details', draftId: draft.id, question, part: p }); }}><View style={[s.chip, part === p && s.chipActive]}><Text>{p}</Text></View></Tap>)}</View>
    <Field label="Короткая подпись · необязательно" value={question} onChangeText={text => { setQuestion(text); void dispatch({ type: 'draft-details', draftId: draft.id, question: text, part }); }} placeholder="Как вам сочетание?" maxLength={100} /><Text style={s.fineLeft}>{question.length}/100</Text>
    <View style={[s.listRow, { marginTop: 16, paddingVertical: 12 }]}><Text style={[s.listTitle, { flex: 1, flexShrink: 1, minWidth: 0 }]}>Скрыть участников и оценки</Text><View style={{ width: 56, minHeight: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}><Switch accessibilityLabel="Скрыть участников и оценки" value={!!draft.hidden} onValueChange={hidden => { void dispatch({ type: 'draft-details', draftId: draft.id, question, part, hidden }); }} trackColor={{ true: '#F21820', false: '#C3BEB5' }} /></View></View>
    <Muted>{draft.hidden ? 'Получатели увидят автора, образ, подпись и свою оценку. Другие участники и их оценки будут скрыты.' : 'Получатели увидят автора, участников и все оценки.'}</Muted>
    {draft.groupId && <Muted>Получатели — сохранённый круг друзей. Голосование — 15 минут. Участники видят событие только во время голосования, вы — до часа с отправки.</Muted>}
    <Button label={busy ? 'Подождите…' : draft.groupId ? 'Отправить группе на оценку' : 'Далее · выбрать получателей'} disabled={busy || !draft.photos.length} onPress={() => { void next(); }} />
  </Page>;
  return <Page scroll={false}><Text style={s.cameraTitle}>{candidate ? 'Ваш снимок.' : 'Снимите образ.'}</Text>
    <Text style={s.cameraSubtitle}>{append && look ? `Фото ${look.photos.length + 1} из 3 · осталось ${Math.max(0, Math.ceil((look.startedAt + 900000 - now) / 60000))} мин.` : `Фото ${(draft?.photos.length || 0) + 1} из 3`}</Text>
    <View style={[s.cameraPreview, { minHeight: 140 }]}>
      {candidate ? <PhotoImage photo={candidate} full /> : focused && cameraStarted && permission?.granted ? <CameraView ref={camera} style={{ flex: 1 }} facing={facing} mode="picture" onCameraReady={() => setReady(true)} onMountError={() => { setCameraStarted(false); setError('Камера не запустилась. Возможно, она занята другим приложением.'); }} /> : <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><Text style={s.leadSmall}>Нужен новый снимок с камеры. Галерея для примерок недоступна.</Text><Muted>Сделайте до трёх снимков одного образа с разных сторон.</Muted></View>}
    </View>
    {!!error && <Text accessibilityRole="alert" style={[s.fineLeft, { color: '#B3181E' }]}>{error}</Text>}
    {busy && <ActivityIndicator style={{ marginTop: 10 }} color="#F21820" />}
    {candidate ? <><Button label={busy ? 'Сохраняем…' : append ? 'Добавить снимок к образу' : 'Использовать снимок'} disabled={busy} onPress={() => { void acceptPicture(); }} /><Button label="Переснять" small light disabled={busy} onPress={() => { setCandidate(null); setReady(false); }} /></> : cameraStarted ? <View style={s.cameraControls}>
      <Tap label="Повернуть камеру" onPress={() => { setFacing(old => old === 'back' ? 'front' : 'back'); setReady(false); }}><Text style={s.cameraSide}>↻</Text></Tap>
      <Tap label="Сделать снимок" onPress={() => { void takePicture(); }}><View style={[s.shutter, (!ready || busy) && { opacity: 0.35 }]}><View style={s.shutterInner} /></View></Tap>
      <Tap label="Закрыть камеру" onPress={() => { setCameraStarted(false); setReady(false); }}><Text style={s.cameraSide}>×</Text></Tap>
    </View> : <>
      <Button label="Открыть камеру" onPress={() => { void openCamera(); }} />
      {permission && !permission.granted && !permission.canAskAgain && Platform.OS !== 'web' && <Button label="Настройки доступа" small light onPress={() => { void Linking.openSettings(); }} />}
      <Button label="Тестовый снимок · без камеры" small light onPress={() => { setCandidate({ id: id(), uri: 'demo', demo: true }); }} />
      {!!draft?.photos.length && <Button label={`К выбранным фото · ${draft.photos.length}`} small light onPress={() => setReview(true)} />}
    </>}
  </Page>;
}

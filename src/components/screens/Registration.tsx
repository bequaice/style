import { useState } from 'react';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { person, type Photo } from '../../domain/model';
import { savePhoto } from '../../services/photos';
import { useStore } from '../../state/Store';
import { AvatarPicker } from '../AvatarPicker';
import { Button, Field, Muted, Page, Title } from '../UI';
import { styles as s } from '../styles';

export function Registration() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState<Photo>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = state.registeredUserId ? person(state, state.registeredUserId) : undefined;
  const register = async () => {
    if (!avatar || busy) return;
    setBusy(true); setError('');
    try {
      if (await dispatch({ type: 'register', name, phone, avatar: savePhoto(avatar.uri) })) router.replace('/home');
    } catch { setError('Не удалось сохранить фото профиля. Проверьте свободное место.'); }
    finally { setBusy(false); }
  };
  return <Page back={false}><Title subtitle="Ваше имя и фотография будут видны знакомым.">Знакомимся</Title>
    <Field label="Имя и фамилия" value={name} onChangeText={setName} maxLength={40} placeholder="Как вас зовут?" />
    <Field label="Номер телефона" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} placeholder="+7 …" />
    <AvatarPicker photo={avatar} onChange={setAvatar} />
    <Muted>ID будет создан автоматически. Знакомые увидят ваше имя, фото и номер, даже если записали вас в контактах иначе.</Muted>
    {!!error && <Text style={s.fineLeft}>{error}</Text>}
    <Button label={busy ? 'Создаём профиль…' : 'Создать локальный аккаунт'} disabled={busy || name.trim().length < 2 || !phone.trim() || !avatar} onPress={() => { void register(); }} />
    {existing && <Button label={`Войти как ${existing.name}`} light onPress={() => { void dispatch({ type: 'switch', userId: existing.id }).then(async ok => { if (ok && await dispatch({ type: 'login' })) router.replace('/home'); }); }} />}
    <Button label="Посмотреть демоверсию" light onPress={() => { void dispatch({ type: 'login' }).then(ok => { if (ok) router.replace('/home'); }); }} />
    <Muted>Пока без сервера: профиль сохраняется только на этом устройстве. Подтверждение номера по SMS и вход с других телефонов подключим позже.</Muted>
  </Page>;
}

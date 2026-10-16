import { useState } from 'react';
import { Image, Platform, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { id, type Photo } from '../domain/model';
import { Button, Muted } from './UI';

export function AvatarPicker({ photo, onChange }: { photo?: Photo; onChange: (photo: Photo) => void }) {
  const [error, setError] = useState('');
  const pick = async () => {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      let uri = asset.uri;
      if (Platform.OS === 'web') {
        if (asset.base64) uri = `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
        else {
          const blob = await (await fetch(asset.uri)).blob();
          uri = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
        }
      }
      onChange({ id: id(), uri });
    } catch { setError('Не удалось выбрать фотографию. Проверьте разрешение на доступ к фото и попробуйте ещё раз.'); }
  };
  return <View style={{ marginTop: 16 }}>{photo && <Image accessibilityLabel="Предпросмотр фотографии профиля" source={{ uri: photo.uri }} style={{ width: 104, height: 104, borderRadius: 52, alignSelf: 'center' }} />}
    <Button label={photo ? 'Изменить фотографию профиля' : 'Добавить фотографию профиля'} small light onPress={() => { void pick(); }} />{!!error && <Muted>{error}</Muted>}
  </View>;
}

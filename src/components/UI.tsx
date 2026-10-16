import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { styles as s, red } from './styles';
import type { Person, Photo } from '../domain/model';

export const goBack = () => router.canGoBack() ? router.back() : router.replace('/home');
export const groupRoute = (groupId: string, lookId?: string): Href => ({ pathname: '/chat', params: { groupId, ...(lookId ? { lookId } : {}) } });
export function Button({ label, onPress, light = false, disabled = false, small = false }: { label: string; onPress: () => void; light?: boolean; disabled?: boolean; small?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, light && s.buttonLight, small && { minHeight: 44 }, (pressed || disabled) && { opacity: disabled ? 0.4 : 0.7 }]}>
    <Text style={[s.buttonText, light && s.buttonTextLight, small && { fontSize: 15 }]}>{label}</Text>
    {!light && !small && <Text style={s.redArrow}>↗</Text>}
  </Pressable>;
}
export function Tap({ children, onPress, label }: { children: ReactNode; onPress: () => void; label?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.65 }}>{children}</Pressable>;
}
export function Page({ children, back = true, scroll = true, footer }: { children: ReactNode; back?: boolean; scroll?: boolean; footer?: ReactNode }) {
  const body = <><View style={s.header}>{back ? <Tap label="Назад" onPress={goBack}><Text style={s.back}>←</Text></Tap> : <Text style={s.brandSmall}>примерка</Text>}<Text style={s.brandSmall}>{back ? 'примерка' : ''}</Text></View>{children}</>;
  return <View style={s.stage}><SafeAreaView style={s.safe}><StatusBar style="dark" />
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.scrollPage, { flexGrow: 1 }]}>{body}</ScrollView> : <View style={[s.cameraPage, { paddingBottom: 12 }]}>{body}</View>}
    {footer}
  </SafeAreaView></View>;
}
export function Title({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return <><Text accessibilityRole="header" style={s.heroSmall}>{children}<Text style={{ color: red }}>.</Text></Text>{!!subtitle && <Text style={s.leadSmall}>{subtitle}</Text>}</>;
}
export function Muted({ children }: { children: ReactNode }) { return <Text style={s.fineLeft}>{children}</Text>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <View style={{ paddingVertical: 30 }}><Text style={s.sectionTitle}>{title}</Text><Muted>{children}</Muted></View>;
}
export function Avatar({ who, size = 48 }: { who: Person; size?: number }) {
  return <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: who.tone, overflow: 'hidden' }]}>{who.avatar ? <Image accessibilityLabel={`Фото профиля: ${who.name}`} source={{ uri: who.avatar.uri }} style={{ width: '100%', height: '100%' }} /> : <Text style={s.avatarText}>{who.name.split(' ').slice(0, 2).map(w => w[0]).join('')}</Text>}</View>;
}
export function PhotoImage({ photo, thumb = false, full = false }: { photo: Photo; thumb?: boolean; full?: boolean }) {
  return <Image accessibilityLabel={photo.demo ? 'Демонстрационный образ' : 'Снимок образа'} source={photo.demo ? require('../../assets/look-clean-v2.png') : { uri: photo.uri }}
    style={thumb ? { width: 70, height: 88, borderRadius: 5 } : full ? { width: '100%', height: '100%' } : s.referenceImage} resizeMode={full ? 'contain' : 'cover'} />;
}
export function Field({ label, value, onChangeText, placeholder, maxLength = 100, keyboardType = 'default' }: { label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; maxLength?: number; keyboardType?: 'default' | 'phone-pad' }) {
  return <View style={{ marginTop: 18 }}><Text style={{ color: '#5E584F', fontSize: 13 }}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} maxLength={maxLength} keyboardType={keyboardType} autoCapitalize="none" placeholderTextColor="#817D74" style={[s.search, { marginTop: 0 }]} /></View>;
}
export function Confirm({ label, title, message, onConfirm, danger = false, light = true }: { label: string; title: string; message: string; onConfirm: () => Promise<unknown> | void; danger?: boolean; light?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  return <><Button label={label} light={light} small onPress={() => setVisible(true)} />
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => { if (!busy) setVisible(false); }}>
      <View style={s.modalShade}><View accessibilityViewIsModal style={s.modalCard}>
        <Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text><Text style={s.leadSmall}>{message}</Text>
        <Button label={busy ? 'Подождите…' : label} disabled={busy} onPress={() => { setBusy(true); Promise.resolve(onConfirm()).finally(() => { setBusy(false); setVisible(false); }); }} />
        <Button label="Отмена" disabled={busy} light onPress={() => setVisible(false)} />
        {danger && <Muted>Действие изменит только локальные данные этой версии.</Muted>}
      </View></View>
    </Modal></>;
}
export function Loading() { return <Page back={false}><View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={red} /><Muted>Открываем ваши примерки…</Muted></View></Page>; }
export function Nav({ screen, unread }: { screen: string; unread: number }) {
  const links: { label: string; route: Href; name: string; icon: string }[] = [
    { label: 'Мои примерки', route: '/home', name: 'home', icon: '◉' },
    { label: 'События', route: '/events', name: 'events', icon: '♢' },
    { label: 'Друзья', route: '/friends', name: 'friends', icon: '♧' },
    { label: unread ? `Уведомления · ${unread}` : 'Уведомления', route: '/notifications', name: 'notifications', icon: '♧' }, { label: 'Профиль', route: '/profile', name: 'profile', icon: '◎' },
  ];
  return <View style={s.nav}>{links.map(l => <View key={l.name} style={{ flex: 1 }}><Tap label={l.label} onPress={() => router.replace(l.route)}><View style={s.navItem}><Text style={{ fontSize: 23, color: screen === l.name ? red : '#6E6860' }}>{l.icon}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ fontSize: 10, color: screen === l.name ? red : '#6E6860' }}>{l.label}</Text></View></Tap></View>)}</View>;
}

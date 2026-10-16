import { Modal, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useStore } from '../state/Store';
import { Button, Loading, Title } from './UI';
import { Home, Events, Chat, Participants } from './screens/Looks';
import { Friends, Profile, Notifications } from './screens/People';
import { Camera } from './screens/Camera';
import { NewGroup } from './screens/NewGroup';
import { Registration } from './screens/Registration';
import { styles as s } from './styles';

export type Screen = 'welcome' | 'home' | 'events' | 'chat' | 'participants' | 'newGroup' | 'camera' | 'friends' | 'profile' | 'notifications';
export default function Prototype({ screen }: { screen: Screen }) {
  const { ready, state, error, clearError, retry } = useStore();
  let content;
  if (!ready) content = <Loading />;
  else if (!state.signedIn) content = <Registration />;
  else if (screen === 'welcome') content = <Redirect href="/home" />;
  else content = {
    home: <Home />, events: <Events />, chat: <Chat />, participants: <Participants />, newGroup: <NewGroup />,
    camera: <Camera />, friends: <Friends />, profile: <Profile key={state.activeUserId} />, notifications: <Notifications />,
  }[screen];
  return <>{content}<Modal visible={!!error} transparent animationType="fade" onRequestClose={clearError}>
    <View style={s.modalShade}><View style={s.modalCard}><Title>Не получилось</Title><Text style={s.leadSmall}>{error}</Text>
      <Button label={ready ? 'Понятно' : 'Повторить'} onPress={() => { clearError(); if (!ready) retry(); }} />
    </View></View>
  </Modal></>;
}

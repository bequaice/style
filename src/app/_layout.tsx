import { Stack } from 'expo-router';
import { StoreProvider } from '../state/Store';

export default function RootLayout() {
  return <StoreProvider><Stack screenOptions={{ headerShown: false, animation: 'fade' }} /></StoreProvider>;
}

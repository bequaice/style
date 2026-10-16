import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { id, type Photo, type State } from '../domain/model';

export function savePhoto(uri: string): Photo {
  const photoId = id();
  if (Platform.OS === 'web') return { id: photoId, uri: uri.startsWith('data:') ? uri : `data:image/jpeg;base64,${uri}` };
  const directory = new Directory(Paths.document, 'primerka-photos');
  directory.create({ intermediates: true, idempotent: true });
  const destination = new File(directory, `${photoId}.jpg`);
  new File(uri).copy(destination);
  return { id: photoId, uri: destination.uri };
}

export function collectPhotos(s: State) {
  if (Platform.OS === 'web') return;
  try {
    const directory = new Directory(Paths.document, 'primerka-photos');
    if (!directory.exists) return;
    const used = new Set([...s.people.flatMap(p => p.avatar ? [p.avatar] : []), ...s.history.flatMap(g => g.look?.photos || []), ...s.groups.flatMap(g => g.look?.photos || []), ...(s.draft?.photos || [])].map(p => p.uri));
    for (const entry of directory.list()) {
      // Recently copied files might still be waiting for their queued state write.
      if (entry instanceof File && !used.has(entry.uri) && Date.now() - (entry.modificationTime || Date.now()) > 60_000) entry.delete();
    }
  } catch { /* Expired files are retried during the next cleanup; the UI is already inaccessible. */ }
}

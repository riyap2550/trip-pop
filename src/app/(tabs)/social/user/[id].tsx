import { useLocalSearchParams } from 'expo-router';

import { SocialProfileView } from '@/components/social/social-profile-view';
import { Screen } from '@/components/ui/primitives';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <SocialProfileView userId={id} />
    </Screen>
  );
}

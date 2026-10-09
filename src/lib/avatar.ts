/** Six distinct background colors derived from the brand palette for user avatars. */
const AVATAR_COLORS = [
  '#278EA5', // ocean
  '#A9D6C7', // seafoam
  '#123047', // navy
  '#F4E9D8', // sand
  '#23775D', // success green
  '#A3620F', // warning amber
];

const DARK_AVATAR_COLORS = ['#278EA5', '#123047', '#23775D'];

/** A stable color per user, so someone looks the same on every screen. */
export function getCollaboratorColor(userId: string): string {
  const slice = userId.slice(-4);
  const index = parseInt(slice, 16) % AVATAR_COLORS.length;
  return AVATAR_COLORS[isNaN(index) ? 0 : index];
}

/** Dark backgrounds get white text, light ones get navy text. */
export function getAvatarTextColor(background: string): string {
  return DARK_AVATAR_COLORS.includes(background) ? '#FFFDFC' : '#123047';
}

export function getInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

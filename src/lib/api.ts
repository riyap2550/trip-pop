import Constants from 'expo-constants';
import type { ImageSource } from 'expo-image';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Where the backend lives. Set EXPO_PUBLIC_API_URL to override. Otherwise we
 * reuse the dev server's host, so the iOS simulator and a phone on the same
 * Wi-Fi both reach the backend running on your Mac.
 */
function resolveBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:8000`;
}

export const API_URL = resolveBaseUrl();

/** An error response from the backend. Network failures throw a plain Error instead. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

let _tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>): void {
  _tokenGetter = fn;
}

/** Trades the stored refresh token for a new access token; resolves null if that didn't work. */
let _refreshHandler: (() => Promise<string | null>) | null = null;
let _refreshInFlight: Promise<string | null> | null = null;

export function setRefreshHandler(fn: () => Promise<string | null>): void {
  _refreshHandler = fn;
}

export async function getAccessToken(): Promise<string | null> {
  return _tokenGetter ? _tokenGetter() : null;
}

/**
 * The backend rotates the refresh token on every use and revokes the old one, so two refreshes
 * running at once would log the user out. Every caller that hits a 401 shares this one promise.
 */
function refreshOnce(): Promise<string | null> {
  if (!_refreshHandler) return Promise.resolve(null);
  if (!_refreshInFlight) {
    _refreshInFlight = _refreshHandler()
      .catch(() => null)
      .finally(() => { _refreshInFlight = null; });
  }
  return _refreshInFlight;
}

export type ItemCategory = 'activity' | 'meal' | 'transport' | 'lodging' | 'flight' | 'free_time';

export type MemberRole = 'owner' | 'editor' | 'viewer';

export type TripMember = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: MemberRole;
  joined_at: string;
};

export type InviteInfo = {
  trip_id: string;
  trip_title: string;
  inviter_name: string;
  role: MemberRole;
  expired: boolean;
};

export type ItineraryEvent = {
  id: string;
  trip_id: string;
  at: string;
  action: 'add' | 'edit' | 'delete' | 'chat_change';
  item_id: string | null;
  day_date: string | null;
  author_user_id: string;
  author_name: string;
  summary: string;
};

export type ItineraryItem = {
  id: string;
  time: string;
  title: string;
  category: ItemCategory;
  est_cost_usd: number;
  indoor: boolean;
  place_name?: string;
  notes: string;
  booking_url: string | null;
  added_by_user_id?: string;
  added_by_name?: string;
};

export type TripStatus = 'planned' | 'booked' | 'in_progress' | 'awaiting_feedback' | 'completed';

/** Who outside the trip can see it. "friends" means friends of any traveler on it. */
export type TripPrivacy = 'private' | 'friends' | 'public';

export type ChatMessage = { role: 'user' | 'assistant'; text: string; at: string };

export type ItemFields = {
  category?: ItemCategory;
  time?: string;
  title?: string;
  place_name?: string;
  est_cost_usd?: number;
  notes?: string;
  indoor?: boolean;
};

export type TripChanges = {
  title?: string;
  budget_usd?: number;
  travelers?: number;
  start_date?: string;
  end_date?: string;
};

export type Trip = {
  id: string;
  title: string;
  goal: string;
  destination: string;
  country: string;
  origin: string;
  start_date: string;
  end_date: string;
  travelers: number;
  hotel_style: string;
  budget_usd: number;
  summary: string;
  why_it_fits: string;
  status: TripStatus;
  privacy: TripPrivacy;
  costs: { flights: number; hotel: number; food: number; activities: number; total: number };
  /** Null when there's nothing to book: no flight on ground trips, no hotel on day trips. */
  booking_links: { flight: string | null; hotel: string | null };
  travel_mode?: 'flight' | 'ground';
  days: { date: string; theme: string; items: ItineraryItem[] }[];
  changes: { at: string; date: string; reason: string; summary: string }[];
  feedback: { rating: number; what_worked: string; what_didnt: string; agent_summary: string } | null;
  documents_checked_at?: string;
  ended_at?: string;
  chat?: ChatMessage[];
  /** Set by "Maybe later" on the feedback prompt; don't prompt again before this time. */
  feedback_snoozed_until?: string;
};

export type TripDetail = Trip & {
  documents: TravelDocument[];
  holds: Hold[];
  membership?: { role: MemberRole; members_count: number };
};

export type Watch = {
  id: string;
  trip_id: string;
  trip_title: string | null;
  kind: 'flight' | 'hotel';
  label: string;
  target_price: number;
  price_unit: string;
  active: boolean;
  history: { t: string; price: number }[];
  booking_url: string;
  last_checked?: string;
  /** Only on /deals: the caller's role on this watch's trip. */
  my_role?: MemberRole;
};

export type Alert = {
  id: string;
  watch_id: string;
  trip_id: string;
  hold_id: string | null;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
};

export type HoldStatus = 'pending_approval' | 'approved' | 'declined' | 'expired';

export type Hold = {
  id: string;
  kind: 'flight' | 'hotel' | 'change';
  trip_id: string;
  title: string;
  details: string;
  reason?: string;
  price: number;
  status: HoldStatus;
  expires_at: string;
  booking_url: string;
  simulated?: boolean;
  /** Only on /deals: the caller's role on this hold's trip. */
  my_role?: MemberRole;
};

export type Deals = { watches: Watch[]; alerts: Alert[]; holds: Hold[] };

export type TravelDocument = {
  id: string;
  trip_id: string;
  trip_title?: string;
  trip_start?: string;
  title: string;
  detail: string;
  category: 'passport' | 'visa' | 'entry' | 'health' | 'insurance' | 'other';
  action_required: boolean;
  deadline: string;
  remind_at: string;
  urgent: boolean;
  source_url: string | null;
  done: boolean;
};

export type Profile = {
  name: string;
  home_airport: string;
  passport_country: string;
  passport_expiry: string | null;
  budget_style: 'value' | 'mid' | 'luxury';
  typical_daily_budget: number | null;
  pace: 'relaxed' | 'balanced' | 'packed';
  interests: string[];
  dislikes: string[];
  learned_notes: string[];
  history: { at: string; source: string; reason: string; changes: string[] }[];
};

export type FriendshipStatus = 'none' | 'friends' | 'outgoing' | 'incoming';

/** Another TripPop user as the viewer sees them. Never includes email. */
export type UserCard = { id: string; display_name: string; avatar_url: string | null; friendship: FriendshipStatus; request_id: string | null };

export type FriendRequest = { id: string; user: UserCard; created_at: string };

export type FriendsOverview = {
  friends: (UserCard & { since: string })[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};

export type Photo = {
  id: string;
  trip_id: string;
  day_date: string;
  caption: string;
  created_at: string;
  width: number | null;
  height: number | null;
  uploader: { id: string; display_name: string; avatar_url: string | null };
  can_delete: boolean;
};

/** A trip as shown on profiles and in the feed. Safe for non-members: no money, documents or notes. */
export type TripSummary = {
  id: string;
  title: string;
  destination: string;
  country: string;
  start_date: string;
  end_date: string;
  status: TripStatus;
  privacy: TripPrivacy;
  rating: number | null;
  owner: { id: string; display_name: string; avatar_url: string | null };
  members_count: number;
  photos_count: number;
  cover_photo_id: string | null;
  viewer_is_member: boolean;
};

/** The read-only view of a trip for people who aren't on it. */
export type SharedTrip = TripSummary & {
  summary: string;
  days: {
    date: string;
    theme: string;
    items: { id: string; time: string; title: string; category: ItemCategory; place_name?: string }[];
  }[];
  members: { user_id: string; display_name: string; avatar_url: string | null }[];
  photos: Photo[];
};

export type FeedPost = {
  id: string;
  caption: string;
  created_at: string;
  author: { id: string; display_name: string; avatar_url: string | null };
  trip: TripSummary;
  photos: Photo[];
  can_delete: boolean;
};

export type SocialProfile = {
  user: { id: string; display_name: string; avatar_url: string | null };
  is_me: boolean;
  friendship: FriendshipStatus;
  request_id: string | null;
  stats: { trips: number; countries: number; friends: number; photos: number };
  trips: TripSummary[];
};

/** What the photo picker hands back; only the fields an upload needs. */
export type PhotoAsset = { uri: string; fileName?: string | null; mimeType?: string; width: number; height: number };

export type Job = {
  id: string;
  kind: 'plan' | 'edit' | 'chat' | 'feedback' | 'documents';
  status: 'running' | 'done' | 'error';
  steps: string[];
  result: { trip_id: string; summary: string; documents_job_id?: string } | null;
  error: string | null;
};

async function request<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  // FormData sets its own multipart Content-Type, boundary included
  if (!(init?.body instanceof FormData)) headers['Content-Type'] ??= 'application/json';
  if (!headers['Authorization']) {
    const stored = await getAccessToken();
    if (stored) headers['Authorization'] = `Bearer ${stored}`;
  }
  const token = headers['Authorization']?.replace('Bearer ', '') ?? null;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
    });
  } catch (e) {
    const cause = e instanceof Error && e.message ? ` (${e.message})` : '';
    throw new Error(`Can't reach TripPop at ${API_URL}. Is the backend running?${cause}`);
  }
  if (res.status === 401 && !isRetry && !path.startsWith('/auth/')) {
    // Access tokens are short-lived. If another request already refreshed while this one was
    // in flight, reuse that token instead of rotating the refresh token again.
    const current = await getAccessToken();
    const fresh = current && current !== token ? current : await refreshOnce();
    if (fresh) {
      return request<T>(path, { ...init, headers: { ...(init?.headers as Record<string, string>), Authorization: `Bearer ${fresh}` } }, true);
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.detail ?? `Request failed (${res.status})`, res.status);
  }
  return res.json();
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) });

export type AuthUser = { id: string; email: string; display_name: string; avatar_url: string | null };
export type AuthResponse = { access_token: string; refresh_token: string; user: AuthUser };

/**
 * Adds a picked image to a multipart body. On phones the global fetch is expo/fetch, which rejects
 * React Native's `{ uri, name, type }` parts ("Unsupported FormDataPart implementation"); it takes a File instead.
 */
async function appendImage(form: FormData, asset: PhotoAsset, fallbackName: string) {
  if (Platform.OS === 'web') {
    form.append('file', await (await fetch(asset.uri)).blob(), asset.fileName ?? fallbackName);
  } else {
    form.append('file', new File(asset.uri) as unknown as Blob);
  }
}

async function uploadPhoto(tripId: string, dayDate: string, asset: PhotoAsset, caption = '') {
  const form = new FormData();
  await appendImage(form, asset, 'photo.jpg');
  form.append('day_date', dayDate);
  form.append('caption', caption);
  form.append('width', String(asset.width));
  form.append('height', String(asset.height));
  return request<Photo>(`/trips/${tripId}/photos`, { method: 'POST', body: form });
}

/**
 * Photos are served behind auth, so the token goes in a header rather than the URL. The cache key
 * stays the same across token refreshes, so images aren't downloaded again every 15 minutes.
 */
export const photoImageSource = (photoId: string, token: string | null): ImageSource => ({
  uri: `${API_URL}/photos/${photoId}/file`,
  cacheKey: `photo:${photoId}`,
  headers: token ? { Authorization: `Bearer ${token}` } : undefined,
});

async function uploadAvatar(asset: PhotoAsset) {
  const form = new FormData();
  await appendImage(form, asset, 'avatar.jpg');
  return request<AuthUser>('/me/avatar', { method: 'POST', body: form });
}

/** Profile pictures sit behind auth like photos. The URL carries a version, so a new picture is a new cache entry. */
export const avatarImageSource = (avatarUrl: string, token: string | null): ImageSource => ({
  uri: `${API_URL}${avatarUrl}`,
  cacheKey: `avatar:${avatarUrl}`,
  headers: token ? { Authorization: `Bearer ${token}` } : undefined,
});

export const authRegister = (email: string, password: string, displayName: string) =>
  request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, display_name: displayName }) });
export const authLogin = (email: string, password: string) =>
  request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const authRefresh = (refreshToken: string) =>
  request<AuthResponse>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
export const authLogout = (refreshToken: string) =>
  request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
export const authMe = () => request<AuthUser>('/auth/me');

export const api = {
  plan: (goal: string) => post<Job>('/plan', { goal }),
  job: (id: string) => request<Job>(`/jobs/${id}`),
  trips: () => request<Trip[]>('/trips'),
  trip: (id: string) => request<TripDetail>(`/trips/${id}`),
  deleteTrip: (id: string) => request<{ ok: boolean }>(`/trips/${id}`, { method: 'DELETE' }),
  endTrip: (id: string) => post<Trip>(`/trips/${id}/end`),
  updateTrip: (id: string, changes: TripChanges) => patch<Job>(`/trips/${id}`, changes),
  addItem: (id: string, date: string, fields: ItemFields) => post<Trip>(`/trips/${id}/days/${date}/items`, fields),
  updateItem: (id: string, date: string, itemId: string, fields: ItemFields) =>
    patch<Trip>(`/trips/${id}/days/${date}/items/${itemId}`, fields),
  deleteItem: (id: string, date: string, itemId: string) =>
    request<Trip>(`/trips/${id}/days/${date}/items/${itemId}`, { method: 'DELETE' }),
  chat: (id: string, message: string, localTime: string) =>
    post<Job>(`/trips/${id}/chat`, { message, local_time: localTime }),
  feedback: (id: string, body: { rating: number; what_worked: string; what_didnt: string }) =>
    post<Job>(`/trips/${id}/feedback`, body),
  snoozeFeedback: (id: string) => post<Trip>(`/trips/${id}/feedback/snooze`),
  checkDocuments: (id: string) => post<Job>(`/trips/${id}/documents/check`),
  deals: () => request<Deals>('/deals'),
  runWatcher: () => post<{ alerts_created: number }>('/watcher/run'),
  updateWatch: (id: string, body: { target_price?: number; active?: boolean }) =>
    patch<Watch>(`/watches/${id}`, body),
  approveHold: (id: string) => post<Hold>(`/holds/${id}/approve`),
  declineHold: (id: string) => post<Hold>(`/holds/${id}/decline`),
  markAlertsRead: () => post<{ ok: boolean }>('/alerts/read'),
  documents: () => request<TravelDocument[]>('/documents'),
  updateDocument: (id: string, done: boolean) => patch<TravelDocument>(`/documents/${id}`, { done }),
  profile: () => request<Profile>('/profile'),
  updateProfile: (body: Partial<Profile>) => patch<Profile>('/profile', body),
  tripMembers: (tripId: string) => request<TripMember[]>(`/trips/${tripId}/members`),
  inviteCollaborator: (tripId: string, role: MemberRole) =>
    post<{ url: string; token: string }>(`/trips/${tripId}/invites`, { role }),
  inviteInfo: (token: string) => request<InviteInfo>(`/invites/${token}`),
  acceptInvite: (token: string) => post<{ trip_id: string }>(`/invites/${token}/accept`),
  removeMember: (tripId: string, userId: string) =>
    del<void>(`/trips/${tripId}/members/${userId}`),
  updateMemberRole: (tripId: string, userId: string, role: MemberRole) =>
    patch<void>(`/trips/${tripId}/members/${userId}`, { role }),
  tripEvents: (tripId: string) => request<ItineraryEvent[]>(`/trips/${tripId}/events`),
  registerPushToken: (token: string, platform: string) =>
    post<void>('/users/push-token', { token, platform }),
  updatePrivacy: (tripId: string, privacy: TripPrivacy) => patch<Trip>(`/trips/${tripId}/privacy`, { privacy }),
  createPost: (tripId: string, body: { caption: string; privacy?: TripPrivacy }) =>
    post<FeedPost>(`/trips/${tripId}/posts`, body),
  deletePost: (postId: string) => del<{ ok: boolean }>(`/posts/${postId}`),
  feed: (before?: string) =>
    request<FeedPost[]>(`/social/feed${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  searchUsers: (q: string) => request<UserCard[]>(`/social/users/search?q=${encodeURIComponent(q)}`),
  friends: () => request<FriendsOverview>('/social/friends'),
  sendFriendRequest: (userId: string) => post<UserCard>('/social/friends/requests', { user_id: userId }),
  acceptFriendRequest: (requestId: string) => post<UserCard>(`/social/friends/requests/${requestId}/accept`),
  declineFriendRequest: (requestId: string) => post<{ ok: boolean }>(`/social/friends/requests/${requestId}/decline`),
  cancelFriendRequest: (requestId: string) => del<{ ok: boolean }>(`/social/friends/requests/${requestId}`),
  removeFriend: (userId: string) => del<{ ok: boolean }>(`/social/friends/${userId}`),
  socialProfile: (userId: string) => request<SocialProfile>(`/social/profile/${userId}`),
  sharedTrip: (tripId: string) => request<SharedTrip>(`/social/trips/${tripId}`),
  tripPhotos: (tripId: string) => request<Photo[]>(`/trips/${tripId}/photos`),
  photo: (photoId: string) => request<Photo>(`/photos/${photoId}`),
  uploadPhoto,
  uploadAvatar,
  deleteAvatar: () => del<AuthUser>('/me/avatar'),
  deletePhoto: (photoId: string) => del<{ ok: boolean }>(`/photos/${photoId}`),
};

import Constants from 'expo-constants';

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

let _tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>): void {
  _tokenGetter = fn;
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
};

export type Alert = {
  id: string;
  watch_id: string;
  trip_id: string;
  hold_id: string;
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

export type Job = {
  id: string;
  kind: 'plan' | 'edit' | 'chat' | 'feedback' | 'documents';
  status: 'running' | 'done' | 'error';
  steps: string[];
  result: { trip_id: string; summary: string; documents_job_id?: string } | null;
  error: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) };
  if (_tokenGetter) {
    const token = await _tokenGetter();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new Error(`Can't reach TripPop at ${API_URL}. Is the backend running?`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed (${res.status})`);
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
  inviteCollaborator: (tripId: string, phone: string, role: MemberRole) =>
    post<{ url: string; token: string }>(`/trips/${tripId}/invites`, { phone_number: phone, role }),
  inviteInfo: (token: string) => request<InviteInfo>(`/invites/${token}`),
  acceptInvite: (token: string) => post<{ trip_id: string }>(`/invites/${token}/accept`),
  removeMember: (tripId: string, userId: string) =>
    del<void>(`/trips/${tripId}/members/${userId}`),
  updateMemberRole: (tripId: string, userId: string, role: MemberRole) =>
    patch<void>(`/trips/${tripId}/members/${userId}`, { role }),
  tripEvents: (tripId: string) => request<ItineraryEvent[]>(`/trips/${tripId}/events`),
  registerPushToken: (token: string, platform: string) =>
    post<void>('/users/push-token', { token, platform }),
};

import type {
  AnalyticsReport,
  AppNotification,
  HistoryEntry,
  LeaderboardRow,
  PublicProfile,
} from './types';
import { conductorId, setConductorId } from './storage';

export const DEFAULT_BRIGADE = 'Бригада 7';
export const DEFAULT_DEPOT = 'Депо Санкт-Петербург';

function pingProfile() {
  window.dispatchEvent(new Event('smena-profile'));
}

export type RunSubmitResult = {
  score: number;
  unlocked: string[];
  profile: PublicProfile;
  review: unknown[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('content-type', 'application/json');
  const id = conductorId();
  if (id) headers.set('x-conductor-id', id);
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* тело не json */
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<T>;
}

export async function ensureProfile(displayName: string) {
  const name = displayName.trim();
  if (!name) return null;
  const payload = { displayName: name, brigade: DEFAULT_BRIGADE, depot: DEFAULT_DEPOT };
  try {
    const existing = conductorId();
    if (existing) {
      try {
        const profile = await request<PublicProfile>(`/api/profiles/${existing}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setConductorId(profile.id);
        pingProfile();
        return profile;
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status !== 404) return null;
      }
    }
    const created = await request<PublicProfile>('/api/profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setConductorId(created.id);
    pingProfile();
    return created;
  } catch {
    return null;
  }
}

export async function fetchProfile(id: string) {
  try {
    return await request<PublicProfile>(`/api/profiles/${id}`);
  } catch {
    return null;
  }
}

export async function fetchAnalytics(id: string) {
  try {
    return await request<AnalyticsReport>(`/api/profiles/${id}/analytics`);
  } catch {
    return null;
  }
}

export async function fetchNotifications(id: string) {
  try {
    const data = await request<{ items: AppNotification[] }>(`/api/profiles/${id}/notifications`);
    return data.items;
  } catch {
    return [];
  }
}

export async function markNotificationRead(id: string) {
  try {
    await request<AppNotification>(`/api/notifications/${id}/read`, { method: 'POST' });
    return true;
  } catch {
    return false;
  }
}

export async function fetchLeaderboard(scope: 'brigade' | 'depot' | 'company') {
  try {
    const data = await request<{ scope: string; label: string; rows: LeaderboardRow[] }>(
      `/api/leaderboard?scope=${scope}`,
    );
    return data;
  } catch {
    return null;
  }
}

export async function submitRun(input: {
  id: string;
  mode: 'shift' | 'training';
  queue: string[];
  history: HistoryEntry[];
}) {
  try {
    const result = await request<RunSubmitResult>('/api/runs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    pingProfile();
    return result;
  } catch {
    return null;
  }
}

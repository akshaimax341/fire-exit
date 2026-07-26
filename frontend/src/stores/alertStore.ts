import { create } from 'zustand';
import { api } from '@/lib/api';
import { useAuthStore } from './authStore';
import type { FacilityAlert, FacilityStatistics } from '@/types';

interface AlertStore {
  alerts: FacilityAlert[];
  stats: FacilityStatistics | null;
  fetchAlerts: () => Promise<void>;
  fetchStats: () => Promise<void>;
  acknowledge: (id: string) => Promise<void>;
}

export const useAlertStore = create<AlertStore>((set, get) => ({
  alerts: [],
  stats: null,

  fetchAlerts: async () => {
    const token = useAuthStore.getState().user?.access_token;
    const data = await api<{ alerts: FacilityAlert[] }>('/api/alerts', {}, token);
    set({ alerts: data.alerts ?? [] });
  },

  fetchStats: async () => {
    const token = useAuthStore.getState().user?.access_token;
    const data = await api<FacilityStatistics>('/api/statistics', {}, token);
    set({ stats: data });
  },

  acknowledge: async (id) => {
    const token = useAuthStore.getState().user?.access_token;
    await api(`/api/alerts/${id}/ack`, { method: 'POST', body: JSON.stringify({ acknowledged: true }) }, token);
    set({
      alerts: get().alerts.map((a) =>
        a.id === id || a.alert_id === id ? { ...a, acknowledged: true } : a,
      ),
    });
  },
}));

import { create } from 'zustand';
import { api } from '@/lib/api';
import { useAuthStore } from './authStore';
import type { DeviceState } from '@/types';

interface DeviceStore {
  devices: DeviceState[];
  online: number;
  offline: number;
  loading: boolean;
  fetchDevices: () => Promise<void>;
  upsertDevice: (d: DeviceState) => void;
  setDevices: (devices: DeviceState[]) => void;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  devices: [],
  online: 0,
  offline: 0,
  loading: false,

  fetchDevices: async () => {
    const token = useAuthStore.getState().user?.access_token;
    set({ loading: true });
    try {
      const data = await api<{ devices: DeviceState[]; online_devices: number; offline_devices: number }>(
        '/api/devices',
        {},
        token,
      );
      set({
        devices: data.devices ?? [],
        online: data.online_devices ?? 0,
        offline: data.offline_devices ?? 0,
      });
    } finally {
      set({ loading: false });
    }
  },

  upsertDevice: (d) => {
    const list = [...get().devices];
    const i = list.findIndex((x) => x.device_id === d.device_id);
    if (i >= 0) list[i] = d;
    else list.push(d);
    const online = list.filter((x) => x.online).length;
    set({ devices: list, online, offline: list.length - online });
  },

  setDevices: (devices) => {
    const online = devices.filter((x) => x.online).length;
    set({ devices, online, offline: devices.length - online });
  },
}));

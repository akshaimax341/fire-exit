import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, Role } from '@/types';
import { api } from '@/lib/api';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      login: async (username, password) => {
        const data = await api<{
          access_token: string;
          role: Role;
          username: string;
          full_name: string;
        }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        set({
          user: {
            username: data.username,
            role: data.role,
            full_name: data.full_name,
            access_token: data.access_token,
          },
          isAuthenticated: true,
        });
      },
      logout: () => set({ user: null, isAuthenticated: false }),
      hasRole: (...roles) => {
        const u = get().user;
        return !!u && roles.includes(u.role);
      },
    }),
    { name: 'fireexit-auth' },
  ),
);

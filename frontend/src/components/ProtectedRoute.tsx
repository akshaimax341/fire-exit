import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { Role } from '@/types';
import type { ReactNode } from 'react';

export function ProtectedRoute({
  roles,
  children,
}: {
  roles?: Role[];
  children?: ReactNode;
}) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children ? <>{children}</> : <Outlet />;
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDefaultRoute } from '@/hooks/useDefaultRoute';

interface RedirectIfAuthenticatedResult {
  loading: boolean;
  isAuthenticated: boolean;
}

export function useRedirectIfAuthenticated(): RedirectIfAuthenticatedResult {
  const { user, loading: authLoading } = useAuth();
  const { defaultRoute, loading: routeLoading } = useDefaultRoute();
  const navigate = useNavigate();

  const loading = authLoading || routeLoading;

  useEffect(() => {
    if (!loading && user && defaultRoute) {
      navigate(defaultRoute, { replace: true });
    }
  }, [loading, user, defaultRoute, navigate]);

  return { loading, isAuthenticated: Boolean(user) };
}

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/hooks/useAuth';
import { fetchCurrentOpenShift, Shift } from '../api/shifts';

export function useCurrentShift() {
  const { user } = useAuth();

  const query = useQuery<Shift | null>({
    queryKey: ['current-open-shift', user?.id],
    queryFn: () => (user?.id ? fetchCurrentOpenShift(user.id) : null),
    enabled: Boolean(user?.id),
    staleTime: 1000 * 60, // 1 minute
  });

  return {
    shift: query.data,
    isOpen: Boolean(query.data),
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}


// ============================================
// Shared react-query client
//
// Defaults tuned for a VTT: no surprise refetches mid-session
// (window focus off), but refetch on network reconnect so REST
// resources catch up after a drop alongside the socket resync.
// ============================================

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

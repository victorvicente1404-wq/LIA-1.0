import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listMyConnections } from "./connectors.functions";
import { useAuth } from "@/hooks/useAuth";

export function useConnections() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["lia-connections", user?.id ?? null],
    enabled: !!user,
    queryFn: () => listMyConnections(),
  });

  return {
    user,
    authLoading: loading,
    connections: query.data ?? [],
    connectedIds: (query.data ?? []).map((c) => c.connectorId),
    isLoading: query.isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["lia-connections"] }),
  };
}

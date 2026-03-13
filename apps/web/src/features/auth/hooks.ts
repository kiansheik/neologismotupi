import { useQuery } from "@tanstack/react-query";

import { me } from "@/features/auth/api";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: me,
    retry: false,
  });
}

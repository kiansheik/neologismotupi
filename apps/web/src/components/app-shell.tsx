import { Link, Outlet } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useCurrentUser } from "@/features/auth/hooks";
import { logout } from "@/features/auth/api";
import { Button } from "@/components/ui/button";

export function AppShell() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-brand-200 bg-white/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-semibold text-brand-800">
            {import.meta.env.VITE_APP_NAME ?? "Nheenga Neologismos"}
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/entries" className="text-brand-700 hover:text-brand-900">
              Entries
            </Link>
            <Link to="/submit" className="text-brand-700 hover:text-brand-900">
              Submit
            </Link>
            {user?.is_superuser ? (
              <Link to="/moderation" className="text-brand-700 hover:text-brand-900">
                Moderation
              </Link>
            ) : null}
            {user ? (
              <>
                <Link to="/me" className="text-brand-700 hover:text-brand-900">
                  Me
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                >
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-brand-700 hover:text-brand-900">
                  Login
                </Link>
                <Link to="/signup" className="text-brand-700 hover:text-brand-900">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

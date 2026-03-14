import { ApiError, apiFetch } from "@/lib/api";
import type { PublicUser, User } from "@/lib/types";

export interface RegisterPayload {
  email: string;
  password: string;
  display_name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export async function register(payload: RegisterPayload): Promise<User> {
  return apiFetch<User>("/auth/register", { method: "POST", body: payload });
}

export async function login(payload: LoginPayload): Promise<User> {
  return apiFetch<User>("/auth/login", { method: "POST", body: payload });
}

export async function logout(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

export async function me(): Promise<User | null> {
  try {
    return await apiFetch<User>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.code === "unauthenticated") {
      return null;
    }
    throw error;
  }
}

export async function getPublicUser(userId: string): Promise<PublicUser> {
  return apiFetch<PublicUser>(`/users/${userId}`);
}

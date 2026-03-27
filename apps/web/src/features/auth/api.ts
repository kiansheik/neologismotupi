import { ApiError, apiFetch } from "@/lib/api";
import type { PublicUser, User } from "@/lib/types";

export interface RegisterPayload {
  email: string;
  password: string;
  display_name: string;
  preferred_locale?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RequestPasswordResetPayload {
  email: string;
}

export interface VerifyEmailPayload {
  token: string;
}

export interface ResetPasswordPayload {
  token: string;
  new_password: string;
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

export async function requestPasswordReset(payload: RequestPasswordResetPayload): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/request-password-reset", { method: "POST", body: payload });
}

export async function verifyEmail(payload: VerifyEmailPayload): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/verify-email", { method: "POST", body: payload });
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/reset-password", { method: "POST", body: payload });
}

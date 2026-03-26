import { useAuthStore } from "@/stores/auth-store";
import { buildLoginPath } from "@/lib/domain-config";
import { getJson, postJson } from "./api";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  restaurant_id?: number | null;
  created_at: string;
  updated_at: string;
}

function persistTokens(tokens: TokenResponse) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem("access_token", tokens.access_token);
  localStorage.setItem("refresh_token", tokens.refresh_token);
}

export async function login(credentials: LoginCredentials): Promise<TokenResponse> {
  const data = await postJson<TokenResponse>("/auth/login", credentials, {
    headers: { "Content-Type": "application/json" }
  });
  persistTokens(data);
  return data;
}

export async function register(userData: RegisterData): Promise<User> {
  return postJson<User>("/auth/register", userData);
}

export async function getMe(): Promise<User> {
  return getJson<User>("/auth/me");
}

export function logout() {
  const activeDomain = useAuthStore.getState().activeDomain;
  if (typeof window !== "undefined") {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = buildLoginPath(activeDomain);
  }
}

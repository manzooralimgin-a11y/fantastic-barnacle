import api from "./api";

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

export async function login(credentials: LoginCredentials): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>("/auth/login", credentials, {
    headers: { "Content-Type": "application/json" }
  });
  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("refresh_token", data.refresh_token);
  return data;
}

export async function register(userData: RegisterData): Promise<User> {
  const { data } = await api.post<User>("/auth/register", userData);
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me");
  return data;
}

export function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  window.location.href = "/login";
}

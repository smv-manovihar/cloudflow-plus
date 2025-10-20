export interface User {
  id: string;
  name: string;
  email: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  user: User;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
}

export interface UpdateUserData {
  name: string;
  email: string;
}

export interface ChangePasswordData {
  old_password: string;
  new_password: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export type ApiErrorResult = ApiResponse<never>;


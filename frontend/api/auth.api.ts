import { api } from "@/config/api.config";
import { handleApiError } from "@/utils/helpers";
import {ApiResponse, LoginData, LoginResponse, RegisterData, User } from "@/types/auth.types";

interface MessageResponse {
  message: string;
}

export const login = async (data: LoginData): Promise<ApiResponse<User>> => {
  try {
    const response = await api.post<LoginResponse>("/auth/login", data);
    return {
      success: true,
      message: response.data.message,
      data: response.data.user
    };
  } catch (error) {
    return handleApiError(error, "Login failed") as ApiResponse<User>;
  }
};

export const register = async (data: RegisterData): Promise<ApiResponse<User>> => {
  try {
    const response = await api.post<User>("/auth/register", data);
    return {
      success: true,
      data: response.data, 
    };
  } catch (error) {
    return handleApiError(error, "Registration failed") as ApiResponse<User>;
  }
};

export const refreshToken = async (): Promise<ApiResponse<User>> => {
  try {
    const response = await api.post<MessageResponse>("/auth/refresh");
    return {
      success: true,
      message: response.data.message,
      data: undefined,
    };
  } catch (error) {
    return handleApiError(error, "Token refresh failed") as ApiResponse<User>;
  }
};

export const verifyUser = async (): Promise<ApiResponse<User>> => {
  try {
    const response = await api.get<User>("/auth/me");
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return handleApiError(error, "Failed to verify user") as ApiResponse<User>;
  }
};

export const logout = async (): Promise<ApiResponse<void>> => {
  try {
    const response = await api.post<MessageResponse>("/auth/logout", {}, { 
      withCredentials: true
    });
    return {
      success: true,
      message: response.data.message,
    };
  } catch (error) {
    return handleApiError(error, "Logout failed") as ApiResponse<void>;
  }
};

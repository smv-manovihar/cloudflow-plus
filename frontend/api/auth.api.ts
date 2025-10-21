import { api } from "@/config/api.config";
import { handleApiError } from "@/utils/helpers";
import {ApiResponse, LoginData, LoginResponse, RegisterData, User, UpdateUserData, ChangePasswordData } from "@/types/auth.types";

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
    // Don't log 401 errors for verification as they're expected when not authenticated
    const axiosError = error as any;
    if (axiosError?.response?.status === 401) {
      return { success: false, error: "Not authenticated" };
    }
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

export const updateUserInfo = async (data: UpdateUserData): Promise<ApiResponse<User>> => {
  try {
    const response = await api.put<User>("/auth/info", data);
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return handleApiError(error, "Failed to update user info") as ApiResponse<User>;
  }
};

export const changePassword = async (data: ChangePasswordData): Promise<ApiResponse<void>> => {
  try {
    const response = await api.put<MessageResponse>("/auth/change-password", data);
    return {
      success: true,
      message: response.data.message,
    };
  } catch (error) {
    return handleApiError(error, "Failed to change password") as ApiResponse<void>;
  }
};

export const deleteAccount = async (): Promise<ApiResponse<void>> => {
  try {
    const response = await api.delete<MessageResponse>("/auth/delete-account");
    return {
      success: true,
      message: response.data.message,
    };
  } catch (error) {
    return handleApiError(error, "Failed to delete account") as ApiResponse<void>;
  }
};

import { api } from "@/config/api.config";
import { AxiosError } from "axios";
import { ApiResponse } from "@/types/api.type";

export const login = async (data: LoginData): Promise<ApiResponse<User>> => {
  try {
    const response = await api.post("/auth/login", data, { 
      withCredentials: true
    });
    return {
      success: true,
      message: response.data.message,
      data: response.data.user,
    };
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const register = async (data: RegisterData): Promise<ApiResponse<User>> => {
  try {
    const response = await api.post("/auth/register", data, { 
      withCredentials: true
    });
    return {
      success: true,
      message: response.data.message,
      data: response.data.user,
    };
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const refreshToken = async (): Promise<ApiResponse<User>> => {
  try {
    const response = await api.post("/auth/refresh", {}, { 
      withCredentials: true
    });
    return {
      success: true,
      message: response.data.message,
      data: response.data.user,
    };
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};

export const verifyUser = async (): Promise<ApiResponse<User>> => {
  try {
    const response = await api.get("/auth/me", { 
      withCredentials: true
    });
    return {
      success: true,
      message: response.data.message,
      data: response.data.user,
    };
  } catch (error) {
    return getNewToken(error as AxiosError);
  }
};

export const getNewToken = async (error: AxiosError): Promise<ApiResponse<User>> => {
  // If the error is a 401 error, try to refresh the token
  if (error.response?.status === 401) {
    return await refreshToken();
  }
  
  // For non-401 errors, use regular error handling
  return handleApiError(error);
};

export const logout = async (): Promise<ApiResponse<void>> => {
  try {
    const response = await api.post("/auth/logout", {}, { 
      withCredentials: true
    });
    return {
      success: true,
      message: response.data.message,
    };
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
};
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios"
import { tokenRefreshEvents } from "@/utils/token-refresh-events"
import { toast } from "sonner"

// Create the base axios instance
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
});

export const PUBLIC_FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL;

// Function to reset the refresh token flag (call this on successful login)
export const resetRefreshTokenFlag = () => {
  hadRefreshToken = false;
};

// Function to check if we should show session expired toast
export const shouldShowSessionExpiredToast = () => {
  return hadRefreshToken;
};

// Token refresh state management
let isRefreshing = false;
let hadRefreshToken = false; // Track if user had a refresh token initially
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (error?: unknown) => void;
}> = [];

// Function to process the failed queue
const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  
  failedQueue = [];
};

// Function to refresh the token
const refreshToken = async (): Promise<string | null> => {
  try {
    // Mark that we had a refresh token when we attempt to use it
    hadRefreshToken = true;

    const response = await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
      {},
      { withCredentials: true }
    );
    // Since the backend sets the token in cookies, check for successful response status
    if (response.status === 200) {
      return "refreshed"; // Return a non-null value to indicate success
    }
    return null;
  } catch {
    // Token refresh failed - show session expired toast if we had a refresh token
    if (hadRefreshToken) {
      toast.error("Session expired. Please log in again.", {
        duration: 5000,
        description: "Your session has expired and needs to be renewed."
      });
    }
    return null;
  }
};

// Response interceptor to handle 401 errors
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    // Check if the error is 401 and we haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Skip token refresh for refresh endpoint and public share routes to avoid infinite loops
      if (originalRequest.url?.includes('/auth/refresh') ||( originalRequest.url?.startsWith('/share/') && originalRequest.url?.endsWith('/download'))) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // If we're already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          return api(originalRequest);
        }).catch((err) => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await refreshToken();
        
        if (newToken) {
          processQueue(null, newToken);
          // Emit token refresh event to notify auth context
          tokenRefreshEvents.emit();
          // Retry the original request
          return api(originalRequest);
        } else {
          processQueue(error, null);
          // If refresh fails, redirect to login or handle as needed
          if (typeof window !== 'undefined') {
            // Use a small delay to allow the toast to be shown before redirect
            setTimeout(() => {
              window.location.href = '/login';
            }, 100);
          }
          // Return a silent rejection to prevent Next.js error display
          return Promise.reject(new Error('Session expired - redirecting to login'));
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (typeof window !== 'undefined') {
          // Use a small delay to allow the toast to be shown before redirect
          setTimeout(() => {
            window.location.href = '/login';
          }, 100);
        }
        // Return a silent rejection to prevent Next.js error display
        return Promise.reject(new Error('Session expired - redirecting to login'));
      } finally {
        isRefreshing = false;
      }
    }

    // For non-401 errors or when we don't want to handle them, reject normally
    // For 401 errors that we don't handle (like auth endpoints), make them silent
    if (error.response?.status === 401) {
      return Promise.reject(new Error('Unauthorized - silent error'));
    }

    return Promise.reject(error);
  }
);
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  verifyUser,
  login as loginApi,
  logout as logoutApi,
} from "@/api/auth.api";
import { LoginData, User } from "@/types/auth.types";
import { tokenRefreshEvents } from "@/utils/token-refresh-events";
import { resetRefreshTokenFlag } from "@/config/api.config";
import { AxiosError } from "axios";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginData) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {
    throw new Error("AuthContext not initialized");
  },
  logout: async () => {
    throw new Error("AuthContext not initialized");
  },
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check if we're on auth pages (login/signup) where we shouldn't auto-refresh
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  // Function to refresh user data
  const refreshUserData = async () => {
    try {
      const response = await verifyUser();

      if (response.success && response.data) {
        setUser(response.data);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      // Error refreshing user data - user will be logged out
      // Don't log 401 or 404 errors as they're expected when user is not authenticated or not found
      const axiosError = error as AxiosError;
      if (axiosError?.response?.status !== 401 && axiosError?.response?.status !== 404) {
        // eslint-disable-next-line no-console
        console.error("Error refreshing user data:", error);
      }
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    // Skip initial user check on auth pages
    if (isAuthPage) {
      setIsLoading(false);
      return;
    }

    const checkUser = async () => {
      try {
        setIsLoading(true);
        await refreshUserData();
      } finally {
        setIsLoading(false);
      }
    };

    checkUser();
  }, [isAuthPage]);

  // Listen for token refresh events
  useEffect(() => {
    // Skip token refresh events on auth pages to prevent infinite loops
    if (isAuthPage) {
      return;
    }

    const unsubscribe = tokenRefreshEvents.subscribe(() => {
      // When token is refreshed, re-fetch user data
      refreshUserData();
    });

    return unsubscribe;
  }, [isAuthPage]);

  const login = async (data: LoginData): Promise<User> => {
    try {
      setIsLoading(true);
      const loginResponse = await loginApi(data);

      if (!loginResponse.success) {
        throw new Error(loginResponse.error || "Login failed");
      }

      if (loginResponse.success && loginResponse.data) {
        setUser(loginResponse.data);
        setIsAuthenticated(true);
        // Reset the refresh token flag on successful login
        resetRefreshTokenFlag();
        return loginResponse.data;
      } else {
        throw new Error(
          loginResponse.error || "Failed to fetch user after login"
        );
      }
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await logoutApi();

      if (!response.success) {
        throw new Error(response.error || "Logout failed");
      }

      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      // Still clear local state even if API call fails
      setUser(null);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

/**
 * Utility functions for token refresh and authentication handling
 */

import { api } from "@/config/api.config";
import { tokenRefreshEvents } from "./token-refresh-events";

/**
 * Test function to simulate a 401 error and verify token refresh works
 * This can be used for testing the automatic token refresh functionality
 */
export const testTokenRefresh = async (): Promise<boolean> => {
  try {
    // Make a request that might trigger a 401 if token is expired
    const response = await api.get("/auth/me");
    return response.status === 200;
  } catch (error) {
    console.error("Token refresh test failed:", error);
    return false;
  }
};

/**
 * Check if the current user is authenticated by making a test request
 */
export const checkAuthentication = async (): Promise<boolean> => {
  try {
    const response = await api.get("/auth/me");
    return response.status === 200;
  } catch (error) {
    return false;
  }
};

/**
 * Force a token refresh (useful for testing or manual refresh)
 */
export const forceTokenRefresh = async (): Promise<boolean> => {
  try {
    const response = await api.post("/auth/refresh", {}, { withCredentials: true });
    if (response.status === 200) {
      // Emit event to notify auth context
      tokenRefreshEvents.emit();
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
};

/**
 * Manually trigger user data refresh (useful for testing)
 */
export const triggerUserDataRefresh = (): void => {
  tokenRefreshEvents.emit();
};

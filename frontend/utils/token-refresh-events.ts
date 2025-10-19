/**
 * Event system for token refresh notifications
 * This allows the auth context to be notified when a token refresh occurs
 */

type TokenRefreshCallback = () => void;

class TokenRefreshEventManager {
  private listeners: TokenRefreshCallback[] = [];

  /**
   * Subscribe to token refresh events
   */
  subscribe(callback: TokenRefreshCallback): () => void {
    this.listeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit token refresh event to all listeners
   */
  emit(): void {
    this.listeners.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in token refresh callback:', error);
      }
    });
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners = [];
  }
}

// Create a singleton instance
export const tokenRefreshEvents = new TokenRefreshEventManager();

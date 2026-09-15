import { api } from "@/config/api.config";
import { handleApiError } from "@/utils/helpers";

export interface PublicPlatformConfig {
  sync_enabled: boolean;
  share_target_preference: "primary" | "sync_target";
  has_sync_target: boolean;
}

export interface SystemSettingsResponse {
  sync_enabled: boolean;
  share_target_preference: "primary" | "sync_target";
  has_sync_target: boolean;
  primary_bucket: string;
  sync_target_bucket: string | null;
  updated_at: string | null;
}

export interface SystemSettingsUpdatePayload {
  sync_enabled?: boolean;
  share_target_preference?: "primary" | "sync_target";
}

export const getPublicPlatformConfig = async (): Promise<PublicPlatformConfig | null> => {
  try {
    const { data } = await api.get<PublicPlatformConfig>("/admin/public-config");
    return data;
  } catch (error) {
    handleApiError(error, "Failed to load platform configuration");
    return null;
  }
};

export const getAdminSettings = async (): Promise<SystemSettingsResponse | null> => {
  try {
    const { data } = await api.get<SystemSettingsResponse>("/admin/settings");
    return data;
  } catch (error) {
    handleApiError(error, "Failed to load admin settings");
    return null;
  }
};

export const updateAdminSettings = async (
  payload: SystemSettingsUpdatePayload
): Promise<SystemSettingsResponse | null> => {
  try {
    const { data } = await api.put<SystemSettingsResponse>("/admin/settings", payload);
    return data;
  } catch (error) {
    handleApiError(error, "Failed to update admin settings");
    return null;
  }
};

import { AxiosError } from 'axios';
import { api } from "@/config/api.config";
import { CreateSharedLinkPayload, CreateSharedLinkResultType, DeleteSharedLinkResultType, DownloadLinkResult, FileInfo, GetDownloadLinkResultType, GetFileInfoResultType, GetLinkInfoResultType, GetQrCodeResultType, ListSharedLinksResultType, SharedLink, SharedLinkList, UpdateSharedLinkPayload, UpdateSharedLinkResultType } from '@/types/share.types';


// API Functions

export const createSharedLink = async (payload: CreateSharedLinkPayload): Promise<CreateSharedLinkResultType> => {
  try {
    const { data } = await api.post("/share/create", payload);

    // Validate and map to SharedLink
    const result: SharedLink = {
      id: data.id,
      name: data.name,
      bucket: data.bucket,
      object_key: data.object_key,
      expires_at: data.expires_at,
      enabled: data.enabled,
      has_password: data.has_password,
      qr_code: data.qr_code,
      user_id: data.user_id,
    };

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("Error creating shared link:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while creating the shared link.";
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const getDownloadLink = async (linkId: string, password?: string): Promise<GetDownloadLinkResultType> => {
  try {
    const params = password ? { password } : {};
    const { data } = await api.get(`/share/${linkId}/download`, { params });

    // Validate and map to DownloadLinkResult
    const result: DownloadLinkResult = {
      url: data.url,
      expires_in: data.expires_in,
    };

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("Error getting download link:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while getting the download link.";
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const getQrCode = async (linkId: string): Promise<GetQrCodeResultType> => {
  try {
    const { data } = await api.get(`/share/${linkId}/qr`, { responseType: 'arraybuffer' });

    // Convert ArrayBuffer to base64
    const base64 = btoa(
      new Uint8Array(data).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    const result = `data:image/png;base64,${base64}`;

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("Error getting QR code:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while getting the QR code.";
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const getLinkInfo = async (linkId: string): Promise<GetLinkInfoResultType> => {
  try {
    const { data } = await api.get(`/share/me/${linkId}`);

    // Validate and map to SharedLink
    const result: SharedLink = {
      id: data.id,
      name: data.name,
      bucket: data.bucket,
      object_key: data.object_key,
      expires_at: data.expires_at,
      enabled: data.enabled,
      has_password: data.has_password,
      qr_code: data.qr_code,
      user_id: data.user_id,
    };

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("Error getting link info:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while getting link info.";
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const listSharedLinks = async (
  page: number = 1,
  pageSize: number = 20,
  enabled?: boolean,
  includeExpired: boolean = false,
  q?: string
): Promise<ListSharedLinksResultType> => {
  try {
    const params = {
      page,
      page_size: pageSize,
      ...(enabled !== undefined && { enabled }),
      include_expired: includeExpired,
      ...(q && { q }),
    };
    const { data } = await api.get("/share/me", { params });

    // Validate and map to SharedLinkList
    const result: SharedLinkList = {
      items: data.items.map((item: any) => ({
        id: item.id,
        name: item.name,
        bucket: item.bucket,
        object_key: item.object_key,
        expires_at: item.expires_at,
        enabled: item.enabled,
        has_password: item.has_password,
        qr_code: item.qr_code,
        user_id: item.user_id,
      })),
      total: data.total,
      page: data.page,
      page_size: data.page_size,
    };

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("Error listing shared links:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while listing shared links.";
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const getFileInfo = async (linkId: string): Promise<GetFileInfoResultType> => {
  try {
    const { data } = await api.get(`/share/${linkId}/public`);

    // Validate and map to FileInfo
    const result: FileInfo = {
      name: data.name,
      bucket: data.bucket,
      size_bytes: data.size_bytes,
    };

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("Error getting file info:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while getting file info.";
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const updateSharedLink = async (
  linkId: string,
  payload: UpdateSharedLinkPayload
): Promise<UpdateSharedLinkResultType> => {
  try {
    const { data } = await api.put(`/share/${linkId}`, payload);

    // Validate and map to SharedLink
    const result: SharedLink = {
      id: data.id,
      name: data.name,
      bucket: data.bucket,
      object_key: data.object_key,
      expires_at: data.expires_at,
      enabled: data.enabled,
      has_password: data.has_password,
      qr_code: data.qr_code,
      user_id: data.user_id,
    };

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("Error updating shared link:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while updating the shared link.";
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const deleteSharedLink = async (linkId: string): Promise<DeleteSharedLinkResultType> => {
  try {
    await api.delete(`/share/${linkId}`);

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error deleting shared link:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while deleting the shared link.";
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

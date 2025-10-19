
import { api } from "@/config/api.config";

import {
  CreateSharedLinkPayload,
  CreateSharedLinkResultType,
  DeleteSharedLinkResultType,
  DownloadLinkResult,
  FileInfo,
  GetDownloadLinkResultType,
  GetFileInfoResultType,
  GetLinkInfoResultType,
  GetQrCodeResultType,
  ListSharedLinksResultType,
  SharedLink,
  SharedLinkList,
  UpdateSharedLinkPayload,
  UpdateSharedLinkResultType,
} from "@/types/share.types";

import { handleApiError } from "@/utils/helpers";

// ---------------------------
// Create Shared Link
// ---------------------------

export const createSharedLink = async (
  payload: CreateSharedLinkPayload
): Promise<CreateSharedLinkResultType> => {
  try {
    const payloadToSend = {
      ...payload,
      expires_at: payload.expires_at ? payload.expires_at.toISOString() : undefined,
    };

    const { data } = await api.post("/share/create", payloadToSend);

    const result: SharedLink = {
      id: data.id,
      name: data.name,
      bucket: data.bucket,
      object_key: data.object_key,
      size_bytes: data.size_bytes,
      expires_at: data.expires_at,
      updated_at: data.updated_at,
      created_at: data.created_at,
      enabled: data.enabled,
      has_password: data.has_password,
      qr_code: data.qr_code,
      user_id: data.user_id,
    };

    return { success: true, result };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while creating the shared link.");
  }
};

// ---------------------------
// Get Download Link
// ---------------------------

export const getDownloadLink = async (
  linkId: string,
  password?: string
): Promise<GetDownloadLinkResultType> => {
  try {
    const params = password ? { password } : {};
    const { data } = await api.get(`/share/${linkId}/download`, { params });

    const result: DownloadLinkResult = {
      url: data.url,
      expires_in: data.expires_in,
    };

    return { success: true, result };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while getting the download link.");
  }
};

// ---------------------------
// Get QR Code
// ---------------------------

export const getQrCode = async (linkId: string): Promise<GetQrCodeResultType> => {
  try {
    const { data } = await api.get(`/share/${linkId}/qr`, { responseType: "arraybuffer" });
    const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
    const result = `data:image/png;base64,${base64}`;

    return { success: true, result };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while getting the QR code.");
  }
};

// ---------------------------
// Get Link Info
// ---------------------------

export const getLinkInfo = async (linkId: string): Promise<GetLinkInfoResultType> => {
  try {
    const { data } = await api.get(`/share/me/${linkId}`);

    const result: SharedLink = {
      id: data.id,
      name: data.name,
      bucket: data.bucket,
      object_key: data.object_key,
      size_bytes: data.size_bytes,
      expires_at: data.expires_at,
      updated_at: data.updated_at,
      created_at: data.created_at,
      enabled: data.enabled,
      has_password: data.has_password,
      qr_code: data.qr_code,
      user_id: data.user_id,
    };

    return { success: true, result };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while getting link info.");
  }
};

// ---------------------------
// List Shared Links
// ---------------------------

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

    const result: SharedLinkList = {
      items: data.items.map((item: SharedLink) => ({
        id: item.id,
        name: item.name,
        bucket: item.bucket,
        object_key: item.object_key,
        size_bytes: item.size_bytes,
        expires_at: item.expires_at,
        updated_at: item.updated_at,
        created_at: item.created_at,
        enabled: item.enabled,
        has_password: item.has_password,
        qr_code: item.qr_code,
        user_id: item.user_id,
      })),
      total: data.total,
      page: data.page,
      page_size: data.page_size,
    };

    return { success: true, result };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while listing shared links.");
  }
};

// ---------------------------
// Get File Info
// ---------------------------

export const getSharedFileInfo = async (linkId: string): Promise<GetFileInfoResultType> => {
  try {
    const { data } = await api.get(`/share/${linkId}/public`);
    const result: FileInfo = {
      name: data.name,
      bucket: data.bucket,
      size_bytes: data.size_bytes,
    };

    return { success: true, result };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while getting file info.");
  }
};

// ---------------------------
// Update Shared Link
// ---------------------------

export const updateSharedLink = async (
  linkId: string,
  payload: UpdateSharedLinkPayload
): Promise<UpdateSharedLinkResultType> => {
  try {
    const payloadToSend = {
      ...payload,
      expires_at: payload.expires_at ? payload.expires_at.toISOString() : undefined,
    };

    const { data } = await api.put(`/share/${linkId}`, payloadToSend);

    const result: SharedLink = {
      id: data.id,
      name: data.name,
      bucket: data.bucket,
      object_key: data.object_key,
      size_bytes: data.size_bytes,
      expires_at: data.expires_at,
      updated_at: data.updated_at,
      created_at: data.created_at,
      enabled: data.enabled,
      has_password: data.has_password,
      qr_code: data.qr_code,
      user_id: data.user_id,
    };

    return { success: true, result };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while updating the shared link.");
  }
};

// ---------------------------
// Delete Shared Link
// ---------------------------

export const deleteSharedLink = async (linkId: string): Promise<DeleteSharedLinkResultType> => {
  try {
    await api.delete(`/share/${linkId}`);
    return { success: true };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while deleting the shared link.");
  }
};

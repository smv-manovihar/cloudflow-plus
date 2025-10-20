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
  SharedListItem,
  UpdateSharedLinkPayload,
  UpdateSharedLinkResultType,
} from "@/types/share.types";

import { handleApiError } from "@/utils/helpers";
import { AxiosError } from "axios";

// ---------------------------
// Create Shared Link
// ---------------------------

export const createSharedLink = async (
  payload: CreateSharedLinkPayload
): Promise<CreateSharedLinkResultType> => {
  try {
    const payloadToSend = {
      ...payload,
      expires_at: payload.expires_at ? payload.expires_at.toISOString() : undefined, // Ensure UTC ISO string
    };

    const { data } = await api.post("/share/create", payloadToSend);

    const result: SharedLink = {
      id: data.id,
      name: data.name,
      bucket: data.bucket,
      object_key: data.object_key,
      size_bytes: data.size_bytes,
      expires_at: data.expires_at, // UTC ISO string from backend
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
  } catch (error: unknown) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    const status = axiosError.response?.status;
    let errorMsg = "An unknown error occurred while getting the download link.";
    const detail = axiosError.response?.data?.detail;

    switch (status) {
      case 400:
        errorMsg = "Invalid link ID";
        break;
      case 401:
        errorMsg = detail?.toLowerCase().includes("required") ? "Password required" : "Invalid password";
        break;
      case 403:
        errorMsg = "This link has been disabled by the owner.";
        break;
      case 404:
        errorMsg = "Shared link not found";
        break;
      case 410:
        errorMsg = "This link has expired.";
        break;
      default:
        if (!status) {
          const handled = handleApiError(error, errorMsg);
          errorMsg = handled.error || errorMsg;
        }
    }

    return { 
      success: false, 
      error: { 
        status: status ?? 500,
        message: errorMsg,
        ...(detail && { detail })
      } 
    };
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
      expires_at: data.expires_at, // UTC ISO string from backend
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
      items: data.items.map((item: SharedListItem) => ({
        id: item.id,
        name: item.name,
        bucket: item.bucket,
        size_bytes: item.size_bytes,
        expires_at: item.expires_at, // UTC ISO string from backend
        updated_at: item.updated_at,
        created_at: item.created_at,
        enabled: item.enabled,
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
      has_password: data.has_password || false,
    };

    return { success: true, result };
  } catch (error) {
    const status = (error as AxiosError)?.response?.status;
    let errorMsg = "An unknown error occurred while getting file info.";

    switch (status) {
      case 400:
        errorMsg = "Invalid link ID";
        break;
      case 404:
        errorMsg = "Shared link not found";
        break;
      default:
        errorMsg = handleApiError(error, errorMsg).error || errorMsg;
    }

    return { success: false, error: { status: status ?? 500, message: errorMsg } };
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
    const payloadToSend: any = {};

    // Enabled field
    if (payload.enabled !== undefined) {
      payloadToSend.enabled = payload.enabled;
    }

    // Expiry with explicit flag
    if (payload.remove_expiry === true) {
      payloadToSend.remove_expiry = true;
    } else if (payload.expires_at !== undefined && payload.expires_at !== null) {
      payloadToSend.expires_at = payload.expires_at.toISOString(); // Ensure UTC ISO string
      payloadToSend.remove_expiry = false;
    }

    // Password with explicit flag
    if (payload.remove_password === true) {
      payloadToSend.remove_password = true;
    } else if (payload.password !== undefined && payload.password !== null) {
      payloadToSend.password = payload.password;
      payloadToSend.remove_password = false;
    }

    const { data } = await api.put(`/share/${linkId}`, payloadToSend);

    const result: SharedLink = {
      id: data.id,
      name: data.name,
      bucket: data.bucket,
      object_key: data.object_key,
      size_bytes: data.size_bytes,
      expires_at: data.expires_at, // UTC ISO string from backend
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
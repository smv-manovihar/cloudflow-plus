import { api } from "@/config/api.config";
import {
  DeleteFileErrorResponse,
  DeleteFileResponse,
  FileInfoErrorResponse,
  FileInfoResponse,
  ListFilesErrorResponse,
  ListFilesResponse,
  PaginationInfo,
  S3File,
  UploadFilesErrorResponse,
  UploadFilesResponse,
} from "@/types/files.types";
import { handleApiError } from "@/utils/helpers";

// ---------------------------
// List Files
// ---------------------------
export const listFiles = async (
  prefix?: string,
  q?: string,
  cursor?: string | null,
  pageSize = 12
): Promise<ListFilesResponse | ListFilesErrorResponse> => {
  try {
    const { data } = await api.get("/files", {
      params: {
        page_size: pageSize,
        q: q || undefined,
        prefix: prefix || undefined,
        cursor: cursor || undefined,
      },
    });

    // Defensive: ensure valid shape
    const files: S3File[] = Array.isArray(data?.files) ? data.files : [];

    const pagination: PaginationInfo = {
      count: data?.pagination?.count ?? files.length,
      total: data?.pagination?.total ?? files.length,
      offset: data?.pagination?.offset ?? 0,
      page_size: data?.pagination?.page_size ?? pageSize,
      has_more: Boolean(data?.pagination?.has_more),
      next_cursor: data?.pagination?.next_cursor ?? null,
      current_cursor: data?.pagination?.current_cursor ?? cursor ?? null,
    };

    return {
      success: true,
      files,
      pagination,
      bucket: data?.bucket ?? null,
      prefix: data?.prefix ?? "",
    };
  } catch (error) {
    return {
      ...handleApiError(error, "An unknown error occurred while fetching files."),
      files: [],
      pagination: null,
      bucket: null,
    };
  }
};

// ---------------------------
// Upload Files
// ---------------------------
export const uploadFiles = async (
  files: File[],
  prefixOrOnProgress?: string | ((progress: number) => void),
  onProgressParam?: (progress: number) => void
): Promise<UploadFilesResponse | UploadFilesErrorResponse> => {
  const prefix = typeof prefixOrOnProgress === "string" ? prefixOrOnProgress : undefined;
  const onProgress = typeof prefixOrOnProgress === "function" ? prefixOrOnProgress : onProgressParam;
  try {
    if (!files || files.length === 0) {
      return {
        success: false,
        error: "No files selected for upload.",
        successful_uploads: [],
        failed_uploads: [],
      };
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    let lastProgress = 0;

    const { data } = await api.post("/files", formData, {
      params: {
        prefix: prefix || undefined,
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          if (percent > lastProgress) {
            lastProgress = percent;
            onProgress?.(percent);
          }
        }
      },
    });

    onProgress?.(100);

    return {
      success: true,
      message: data?.message ?? "Files uploaded successfully.",
      bucket: data?.bucket ?? null,
      uploads: Array.isArray(data?.uploads) ? data.uploads : [],
    };
  } catch (error) {
    const axiosError = error as any;
    // Partial success case (multi-status)
    if (axiosError?.response?.status === 207) {
      const detail = axiosError.response.data?.detail;
      if (typeof detail === "object") {
        return {
          success: false,
          error: detail?.message || "Some files failed to upload.",
          successful_uploads: detail?.successful_uploads || [],
          failed_uploads: detail?.failed_uploads || [],
        };
      }
    }

    return {
      ...handleApiError(error, "An unknown error occurred while uploading files."),
      successful_uploads: [],
      failed_uploads: [],
    };
  }
};

// ---------------------------
// Create Folder
// ---------------------------
export const createFolder = async (
  folderPath: string
): Promise<{ success: true; data: any } | { success: false; error: string }> => {
  try {
    const { data } = await api.post("/files/folder", null, {
      params: { folder_path: folderPath },
    });
    return { success: true, data };
  } catch (error) {
    return handleApiError(error, "Failed to create folder");
  }
};

// ---------------------------
// Download File
// ---------------------------
export const downloadFile = async (
  objectKey: string,
  filename?: string
): Promise<{ success: true; sync_status?: string } | { success: false; error: string }> => {
  try {
    if (!objectKey) {
      return { success: false, error: "Invalid file key provided." };
    }

    const response = await api.get(`/files/${objectKey}`, { responseType: "blob" });

    const syncStatus = response.headers["x-sync-status"] || "none";
    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename || objectKey.split("/").pop() || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return { success: true, sync_status: syncStatus };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while downloading the file.");
  }
};

// ---------------------------
// Get File Info
// ---------------------------
export const getFileInfo = async (
  objectKey: string
): Promise<FileInfoResponse | FileInfoErrorResponse> => {
  try {
    const { data } = await api.get(`/files/${objectKey}/info`);

    if (!data) {
      return { success: false, error: "File info not available." };
    }

    return {
      success: true,
      bucket: data.bucket ?? "",
      object_key: data.key ?? objectKey,
      content_length: data.content_length ?? 0,
      last_modified: data.last_modified
        ? new Date(data.last_modified).toISOString()
        : "",
      synced: (data.sync_status === "synced" ? "true" : data.sync_status === "pending" ? "pending" : "false") as "pending" | "true" | "false",
      last_synced: data.last_synced ?? null,
      is_shared: Boolean(data.is_shared),
      shared_link_id: data.shared_link_id ?? null,
    };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while fetching file info.");
  }
};

// ---------------------------
// Delete File
// ---------------------------
export const deleteFile = async (
  objectKey: string,
  deleteType: "local" | "aws" | "both" = "both"
): Promise<DeleteFileResponse | DeleteFileErrorResponse> => {
  try {
    if (!objectKey) {
      return { success: false, error: "Invalid file key provided." };
    }

    const { data } = await api.delete(`/files/${objectKey}`, {
      params: { delete_type: deleteType },
    });

    return {
      success: true,
      message: data?.message ?? "File deleted successfully.",
      bucket: data?.bucket ?? null,
      filename: data?.filename ?? objectKey,
      synced: data?.deleted_from_sync_target ? "true" : "false",
    };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while deleting the file.");
  }
};

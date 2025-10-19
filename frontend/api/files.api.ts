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
  cursor?: string | null,
  pageSize = 12
): Promise<ListFilesResponse | ListFilesErrorResponse> => {
  try {
    const { data } = await api.get("/files", {
      params: {
        page_size: pageSize,
        prefix: prefix || undefined,
        cursor: cursor || undefined,
      },
    });

    // Defensive: ensure valid shape
    const files: S3File[] = Array.isArray(data?.files) ? data.files : [];

    const pagination: PaginationInfo = {
      count: data?.pagination?.count ?? files.length,
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
  onProgress?: (progress: number) => void
): Promise<UploadFilesResponse | UploadFilesErrorResponse> => {
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
// Download File
// ---------------------------
export const downloadFile = async (
  objectKey: string,
  filename?: string
): Promise<{ success: true; synced: boolean } | { success: false; error: string }> => {
  try {
    if (!objectKey) {
      return { success: false, error: "Invalid file key provided." };
    }

    const response = await api.get(`/files/${objectKey}`, { responseType: "blob" });

    const synced = response.headers["x-synced-to-aws"] === "true";
    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename || objectKey.split("/").pop() || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return { success: true, synced };
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
      object_key: data.object_key ?? objectKey,
      content_length: data.content_length ?? 0,
      last_modified: data.last_modified
        ? new Date(data.last_modified).toISOString()
        : "",
      aws_bucket: data.aws_bucket ?? "",
      synced: Boolean(data.synced),
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
  sync = false
): Promise<DeleteFileResponse | DeleteFileErrorResponse> => {
  try {
    if (!objectKey) {
      return { success: false, error: "Invalid file key provided." };
    }

    const { data } = await api.delete(`/files/${objectKey}`, { params: { sync } });

    return {
      success: true,
      message: data?.message ?? "File deleted successfully.",
      bucket: data?.bucket ?? null,
      filename: data?.filename ?? objectKey,
      synced: Boolean(data?.synced),
    };
  } catch (error) {
    return handleApiError(error, "An unknown error occurred while deleting the file.");
  }
};

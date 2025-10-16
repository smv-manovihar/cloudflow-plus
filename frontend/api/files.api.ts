// types/files.types.ts
import { api } from "@/config/api.config";
import { AxiosError } from "axios";
import { toast } from "sonner";

export interface S3File {
  key: string;
  last_modified: string;
  size_bytes: number;
  synced: boolean;
}

export interface PaginationInfo {
  count: number;
  page_size: number;
  has_more: boolean;
  next_cursor: string | null;
  current_cursor: string | null;
}

export interface ListFilesResponse {
  success: true;
  files: S3File[];
  pagination: PaginationInfo;
  bucket: string | null;
  prefix?: string;
}

export interface ListFilesErrorResponse {
  success: false;
  files: [];
  pagination: null;
  bucket: null;
  error?: string;
}

export interface UploadResult {
  filename: string;
  message: string;
  bucket: string;
}

export interface UploadErrorResult {
  filename: string;
  error: string;
  status_code: number;
}

export interface UploadFilesResponse {
  success: true;
  message: string;
  bucket: string;
  uploads: UploadResult[];
}

export interface UploadFilesErrorResponse {
  success: false;
  error: string;
  successful_uploads?: UploadResult[];
  failed_uploads?: UploadErrorResult[];
}

export interface FileInfoResponse {
  success: true;
  bucket: string;
  object_key: string;
  content_length: number;
  last_modified: string;
  synced: boolean;
}

export interface FileInfoErrorResponse {
  success: false;
  error: string;
}

export interface DeleteFileResponse {
  success: true;
  message: string;
  bucket: string;
  filename: string;
  synced: boolean;
}

export interface DeleteFileErrorResponse {
  success: false;
  error: string;
}

// ============== API FUNCTIONS ==============

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

    const files: S3File[] = Array.isArray(data.files) ? data.files : [];

    const pagination: PaginationInfo = {
      count: data.pagination?.count ?? files.length,
      page_size: data.pagination?.page_size ?? pageSize,
      has_more: Boolean(data.pagination?.has_more),
      next_cursor: data.pagination?.next_cursor ?? null,
      current_cursor: data.pagination?.current_cursor ?? cursor ?? null,
    };

    return {
      success: true,
      files,
      pagination,
      bucket: data.bucket ?? null,
      prefix: data.prefix,
    };
  } catch (error) {
    console.error("Error listing files:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while fetching files.";

    return {
      success: false,
      files: [],
      pagination: null,
      bucket: null,
      error: errorMessage,
    };
  }
};


export const uploadFiles = async (
  files: File[],
  onProgress?: (progress: number) => void
): Promise<UploadFilesResponse | UploadFilesErrorResponse> => {
  try {
    const formData = new FormData();
    
    files.forEach((file) => {
      formData.append("files", file);
    });

    const { data } = await api.post("/files", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress?.(percentCompleted);
        }
      },
    });

    toast.success(data.message || "Files uploaded successfully");

    return {
      success: true,
      message: data.message,
      bucket: data.bucket,
      uploads: data.uploads,
    };
  } catch (error) {
    console.error("Error uploading files:", error);
    const axiosError = error as AxiosError<{
      detail?: string | {
        message: string;
        successful_uploads?: UploadResult[];
        failed_uploads?: UploadErrorResult[];
      };
    }>;

    // Handle multi-status response (207)
    if (axiosError?.response?.status === 207) {
      const detail = axiosError.response.data.detail;
      if (typeof detail === "object" && detail !== null) {
        const errorMessage = detail.message || "Some files failed to upload";

        
        return {
          success: false,
          error: errorMessage,
          successful_uploads: detail.successful_uploads,
          failed_uploads: detail.failed_uploads,
        };
      }
    }

    const errorMessage =
      typeof axiosError?.response?.data?.detail === "string"
        ? axiosError.response.data.detail
        : axiosError?.message ||
          "An unknown error occurred while uploading files.";

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Downloads a file from the bucket
 */
export const downloadFile = async (
  objectKey: string,
  filename?: string
): Promise<{ success: true; synced: boolean } | { success: false; error: string }> => {
  try {
    const response = await api.get(`/files/${objectKey}`, {
      responseType: "blob",
    });

    // Get sync status from custom header
    const synced = response.headers["x-synced-to-aws"] === "true";

    // Create blob URL and trigger download
    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || objectKey.split("/").pop() || "download";
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return {
      success: true,
      synced,
    };
  } catch (error) {
    console.error("Error downloading file:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while downloading the file.";

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Gets metadata/info for a specific file
 */
export const getFileInfo = async (
  objectKey: string
): Promise<FileInfoResponse | FileInfoErrorResponse> => {
  try {
    const { data } = await api.get(`/files/${objectKey}/info`);

    return {
      success: true,
      bucket: data.bucket,
      object_key: data.object_key,
      content_length: data.content_length,
      last_modified: data.last_modified,
      synced: data.synced,
    };
  } catch (error) {
    console.error("Error getting file info:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while fetching file info.";

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Deletes a file from the bucket
 */
export const deleteFile = async (
  objectKey: string,
  sync = false
): Promise<DeleteFileResponse | DeleteFileErrorResponse> => {
  try {
    const { data } = await api.delete(`/files/${objectKey}`, {
      params: {
        sync,
      },
    });

    toast.success(data.message || "File deleted successfully");

    return {
      success: true,
      message: data.message,
      bucket: data.bucket,
      filename: data.filename,
      synced: data.synced,
    };
  } catch (error) {
    console.error("Error deleting file:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while deleting the file.";

    return {
      success: false,
      error: errorMessage,
    };
  }
};

import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { api } from "@/config/api.config";

// Response types based on backend structures

// For sync_bucket endpoint success response
export interface BucketSyncResult {
  synced_files: number;
  skipped_files?: number;
  failed_files: Array<{
    object_key: string;
    error: string;
  }>;
  total_files?: number; // Inferred as sum of synced + skipped + failed
  // Add other fields if returned by sync_single_bucket, e.g., timestamp, summary
}

// For sync_file endpoint success/failure response (unified)
export interface FileSyncResult {
  status: 'synced' | 'updated' | 'skipped' | 'failed';
  object_key: string;
  error?: string; // Only present if status === 'failed'
}

// For sync_bucket_async endpoint success response
export interface AsyncSyncResult {
  status: 'accepted';
  message: string;
}

// Wrapper types for API functions (consistent with listFiles pattern)
export interface SyncBucketResponse {
  success: true;
  result: BucketSyncResult;
}

export interface SyncBucketErrorResponse {
  success: false;
  error: string;
}

export type SyncBucketResultType = SyncBucketResponse | SyncBucketErrorResponse;

export const syncBucket = async (): Promise<SyncBucketResultType> => {
  try {
    const { data } = await api.post("/sync");

    // Validate and map to BucketSyncResult
    const result: BucketSyncResult = {
      synced_files: data.synced_files ?? 0,
      skipped_files: data.skipped_files ?? 0,
      failed_files: Array.isArray(data.failed_files) ? data.failed_files : [],
      total_files: data.total_files ?? (data.synced_files + (data.skipped_files ?? 0) + data.failed_files?.length),
    };

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("Error syncing bucket:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while syncing the bucket.";

    toast.error(errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
};

export interface SyncFilePayload {
  source_bucket?: string;
  destination_bucket?: string;
  object_key: string;
}

export interface SyncFileResponse {
  success: true;
  result: FileSyncResult;
}

export interface SyncFileErrorResponse {
  success: false;
  error: string;
  object_key?: string;
}

export type SyncFileResultType = SyncFileResponse | SyncFileErrorResponse;

export const syncFile = async (
  objectKey: string,
  destinationBucket?: string,
  sourceBucket?: string
): Promise<SyncFileResultType> => {
  try {
    const payload: SyncFilePayload = {
      source_bucket: sourceBucket,
      destination_bucket: destinationBucket,
      object_key: objectKey,
    };

    const { data } = await api.post("/sync/file", payload);

    // Validate and map to FileSyncResult
    const result: FileSyncResult = {
      status: data.status,
      object_key: data.object_key ?? objectKey,
      ...(data.status === 'failed' && { error: data.error }),
    };

    // If status is 'failed', treat as partial success for response handling but flag in result
    if (data.status === 'failed') {
      toast.error(`File sync failed: ${data.error}`);
    }

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("Error syncing file:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while syncing the file.";

    return {
      success: false,
      error: errorMessage,
      object_key: objectKey,
    };
  }
};

export interface SyncBucketAsyncResponse {
  success: true;
  result: AsyncSyncResult;
}

export interface SyncBucketAsyncErrorResponse {
  success: false;
  error: string;
}

export type SyncBucketAsyncResultType = SyncBucketAsyncResponse | SyncBucketAsyncErrorResponse;

export const syncBucketAsync = async (): Promise<SyncBucketAsyncResultType> => {
  try {
    const { data } = await api.post("/sync/async");

    // Map to AsyncSyncResult
    const result: AsyncSyncResult = {
      status: data.status,
      message: data.message,
    };

    toast.success("Async sync operation accepted.");

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error("Error starting async sync:", error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      "An unknown error occurred while starting the async sync.";

    toast.error(errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
};

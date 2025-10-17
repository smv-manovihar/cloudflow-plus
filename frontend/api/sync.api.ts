import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { api } from "@/config/api.config";
import { AsyncSyncResult, BucketSyncResult, FileSyncResult, SyncBucketAsyncResultType, SyncBucketResultType, SyncFilePayload, SyncFileResultType } from '@/types/share.types';


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
      
    return {
      success: false,
      error: errorMessage,
    };
  }
};


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

export const syncBucketAsync = async (): Promise<SyncBucketAsyncResultType> => {
  try {
    const { data } = await api.post("/sync/async");

    const result: AsyncSyncResult = {
      status: data.status,
      message: data.message,
    };

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

    return {
      success: false,
      error: errorMessage,
    };
  }
};

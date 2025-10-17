
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


export interface SyncBucketAsyncResponse {
  success: true;
  result: AsyncSyncResult;
}

export interface SyncBucketAsyncErrorResponse {
  success: false;
  error: string;
}

export type SyncBucketAsyncResultType = SyncBucketAsyncResponse | SyncBucketAsyncErrorResponse;

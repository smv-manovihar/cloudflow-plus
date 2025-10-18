export interface BucketSyncResult {
  synced_files: number;
  skipped_files: number;
  failed_files: string[];
  total_files: number;
}

export interface SyncBucketResultType {
  success: boolean;
  result?: BucketSyncResult;
  error?: string;
}

export interface FileSyncResult {
  status: 'synced' | 'updated' | 'skipped' | 'failed';
  object_key: string;
  error?: string;
}

export interface SyncFileResultType {
  success: boolean;
  result?: FileSyncResult;
  error?: string;
  object_key?: string;
}

export interface SyncFilePayload {
  source_bucket?: string;
  destination_bucket?: string;
  object_key: string;
}

export interface AsyncSyncResult {
  status: string;
  message: string;
}

export interface SyncBucketAsyncResultType {
  success: boolean;
  result?: AsyncSyncResult;
  error?: string;
}

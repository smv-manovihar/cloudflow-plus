export interface SyncStatus {
  sync_enabled: boolean;
  has_sync_target: boolean;
  last_sync_job_id: string | null;
  last_sync_job_status: string | null;
  last_sync_completed_at: string | null;
}

export interface SyncJob {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed';
  total_files: number;
  synced_files: number;
  failed_files: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

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
  object_key: string;
}

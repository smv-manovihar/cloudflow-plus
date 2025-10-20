export interface S3File {
  key: string;
  last_modified: string;
  size_bytes: number;
  synced: boolean;
}

export interface FileItem {
  name: string;
  size: { value: string; unit: string };
  modified: string;
  isFolder: boolean;
  key: string;
  synced: boolean;
  bucket: string | null;
  isShared: boolean;
  sharedLinkId: string | null;
}
export interface PageCache {
  files: FileItem[];
  pagination: PaginationInfo | null;
}

export interface ApiResponse {
  success: boolean;
  files?: S3File[];
  pagination?: PaginationInfo;
  error?: string;
}

export interface Toast {
  type: 'success' | 'error' | 'loading' | 'progress';
  message: string;
  duration?: number;
  progress?: number;
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

export interface FileInfoResponse {
  success: true;
  bucket: string;
  object_key: string;
  content_length: number;
  last_modified: string;
  aws_bucket: string | null;
  synced: boolean;
  last_synced: string | null;
  is_shared: boolean;
  shared_link_id: string;
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

export interface UploadResult extends S3File {
  message: string;
  bucket: string;
}

export interface UploadErrorResult {
  filename: string; // Name of the file that failed
  error: string; // Error message
  status_code: number; // HTTP status code (e.g., 404, 500)
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
  successful_uploads: UploadResult[];
  failed_uploads: UploadErrorResult[];
}

export interface FileDetails {
  name: string;
  size: { value: string; unit: string };
  modified: string;
  type: string;
  bucket: string;
  objectKey: string;
  isShared: boolean;
  isSynced: boolean;
  lastSynced: string | null;
  syncedBucket?: string | null;
  sharedLinkId: string | null;
}

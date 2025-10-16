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
  next_cursor?: string | null;
  current_cursor?: string | null;
}

export interface FileItem {
  name: string;
  size: number;
  modified: string;
  isFolder: boolean;
  key: string;
  synced: boolean;
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
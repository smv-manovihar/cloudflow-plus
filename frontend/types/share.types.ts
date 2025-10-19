export interface CreateSharedLinkPayload {
  bucket: string;
  object_key: string;
  password?: string;
  expires_at?: Date; // JavaScript Date object
  enabled?: boolean;
}

export interface SharedLink {
  id: string;
  name: string;
  bucket: string;
  object_key: string;
  size_bytes?: number;
  expires_at?: string; // ISO datetime
  updated_at: string; // ISO datetime
  created_at: string; // ISO datetime
  enabled: boolean;
  has_password: boolean;
  qr_code?: string;
  user_id?: number;
}

export interface SharedLinkList {
  items: SharedLink[];
  total: number;
  page: number;
  page_size: number;
}

export interface UpdateSharedLinkPayload {
  enabled?: boolean;
  expires_at?: Date; // JavaScript Date object
  password?: string;
}

export interface DownloadLinkResult {
  url: string;
  expires_in: number; // seconds
}

export interface FileInfo {
  name: string;
  bucket: string;
  size_bytes?: number;
}

// Result types for async operations
export type CreateSharedLinkResultType = {
  success: true;
  result: SharedLink;
} | {
  success: false;
  error: string;
};

export type GetDownloadLinkResultType = {
  success: true;
  result: DownloadLinkResult;
} | {
  success: false;
  error: string;
};

export type GetQrCodeResultType = {
  success: true;
  result: string; // base64 PNG
} | {
  success: false;
  error: string;
};

export type GetLinkInfoResultType = {
  success: true;
  result: SharedLink;
} | {
  success: false;
  error: string;
};

export type ListSharedLinksResultType = {
  success: true;
  result: SharedLinkList;
} | {
  success: false;
  error: string;
};

export type GetFileInfoResultType = {
  success: true;
  result: FileInfo;
} | {
  success: false;
  error: string;
};

export type UpdateSharedLinkResultType = {
  success: true;
  result: SharedLink;
} | {
  success: false;
  error: string;
};

export type DeleteSharedLinkResultType = {
  success: true;
} | {
  success: false;
  error: string;
};
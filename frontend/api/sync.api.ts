import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { api } from '@/config/api.config';
import {
  SyncStatus,
  SyncJob,
  FileSyncResult,
  SyncFileResultType,
} from '@/types/sync.types';

/**
 * Fetch current user's sync toggle state & platform sync target availability.
 */
export const getSyncStatus = async (): Promise<SyncStatus | null> => {
  try {
    const { data } = await api.get<SyncStatus>('/sync/status');
    return data;
  } catch (error) {
    console.error('Error fetching sync status:', error);
    return null;
  }
};

/**
 * Toggle user's sync preference on/off.
 */
export const toggleSync = async (enabled: boolean): Promise<SyncStatus | null> => {
  try {
    const { data } = await api.post<SyncStatus>('/sync/toggle', { enabled });
    toast.success(enabled ? 'File sync enabled' : 'File sync disabled');
    return data;
  } catch (error) {
    console.error('Error toggling sync:', error);
    toast.error('Failed to update sync setting');
    return null;
  }
};

/**
 * Trigger an asynchronous full sync job for the user.
 */
export const triggerFullSync = async (): Promise<{ job_id: string } | null> => {
  try {
    const { data } = await api.post('/sync/trigger');
    toast.success('Sync job queued');
    return data;
  } catch (error) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    const msg = axiosError?.response?.data?.detail || 'Failed to start sync job';
    toast.error(msg);
    return null;
  }
};

/**
 * Fetch progress / status of a background sync job.
 */
export const getSyncJobStatus = async (jobId: string): Promise<SyncJob | null> => {
  try {
    const { data } = await api.get<SyncJob>(`/sync/job/${jobId}`);
    return data;
  } catch (error) {
    console.error('Error fetching sync job status:', error);
    return null;
  }
};

/**
 * Sync a single file on-demand.
 */
export const syncFile = async (objectKey: string): Promise<SyncFileResultType> => {
  try {
    const { data } = await api.post('/sync/file', { object_key: objectKey });
    const result: FileSyncResult = {
      status: data.status,
      object_key: objectKey,
    };
    toast.success(`File synced successfully`);
    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error('Error syncing file:', error);
    const axiosError = error as AxiosError<{ detail?: string }>;
    const errorMessage =
      axiosError?.response?.data?.detail ||
      axiosError?.message ||
      'An error occurred while syncing the file.';
    toast.error(errorMessage);
    return {
      success: false,
      error: errorMessage,
      object_key: objectKey,
    };
  }
};

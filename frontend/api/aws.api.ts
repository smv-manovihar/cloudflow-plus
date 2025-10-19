import { api } from "@/config/api.config"
import { AxiosError } from "axios";
import { toast } from "sonner";
import axios from "axios";

const downloadLinksCache: Record<string, { url: string; expiration: number }> = {};

async function getPresignedUrl(bucketName: string, objectKey: string, forceRenew = false): Promise<string> {
    const cacheKey = `${bucketName}/${objectKey}`;
    const now = Math.floor(Date.now() / 1000);
    if (!forceRenew && downloadLinksCache[cacheKey] && downloadLinksCache[cacheKey].expiration > now) {
        return downloadLinksCache[cacheKey].url;
    }
    try {
        const { data } = await api.get(`/aws/buckets/${bucketName}/files/${objectKey}/download-link`);
        const expiration = now + data.expires_in_seconds;
        downloadLinksCache[cacheKey] = { url: data.download_url, expiration };
        return data.download_url;
    } catch (error) {
        const axError = error as AxiosError<{detail: string}>;
        toast.error(axError.response?.data?.detail || "Error getting download link");
        throw error;
    }
}

async function downloadBlobFromUrl(url: string, objectKey: string): Promise<void> {
    const response = await axios.get(url, { responseType: 'blob' });
    const blob = response.data;
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = objectKey.split('/').pop() || 'file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
}

const listBuckets = async () => {
    try {
        const { data } = await api.get("/aws/buckets");
        return {success: true, buckets: data.buckets};
    } catch (error) {
        console.log(error);
        const axError = error as AxiosError<{detail: string}>;
        toast.error(axError.response?.data?.detail || "Error listing buckets");
        return {success: false, buckets: []};
    }
}

const getBucketFiles = async (bucketName: string) => {
    try {
        const { data } = await api.get(`/aws/buckets/${bucketName}/files`);
        return {success: true, files: data.files};
    } catch (error) {
        console.error(error);
        const axError = error as AxiosError<{detail: string}>;
        toast.error(axError.response?.data?.detail || "Error listing files");
        return {success: false, files: []};
    }
}

const uploadFile = async (bucketName: string, file: File) => {
    try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await api.post(`/aws/buckets/${bucketName}/files`, formData, {
            responseType: 'text',
            headers: {
                'Accept': 'text/event-stream'
            }
        });
        // Parse the SSE text to determine final status
        const events = response.data.split('\n\n').filter((line:string) => line.startsWith('data: '));
        if (events.length > 0) {
            const lastData = events[events.length - 1].slice(6);
            const parsed = JSON.parse(lastData);
            if (parsed.status === 'completed') {
                return {success: true};
            } else if (parsed.status === 'error') {
                toast.error(parsed.error || "Upload error");
                return {success: false, error: parsed.error};
            }
        }
        toast.error("Unknown upload error");
        return {success: false, error: 'Unknown error'};
    } catch (error) {
        console.error(error);
        const axError = error as AxiosError<{detail: string}>;
        toast.error(axError.response?.data?.detail || "Error uploading file");
        return {success: false, error};
    }
}

const createBucket = async (bucketName: string) => {
    try {
        const { data } = await api.post(`/aws/buckets/${bucketName}`, {});
        return {success: true, data};
    } catch (error) {
        console.error(error);
        const axError = error as AxiosError<{detail: string}>;
        toast.error(axError.response?.data?.detail || "Error creating bucket");
        return {success: false};
    }
}

const deleteBucket = async (bucketName: string) => {
    try {
        const { data } = await api.delete(`/aws/buckets/${bucketName}`);
        return {success: true, data};
    } catch (error) {
        console.error(error);
        const axError = error as AxiosError<{detail: string}>;
        toast.error(axError.response?.data?.detail || "Error deleting bucket");
        return {success: false, error};
    }
}

const getBucketInfo = async (bucketName: string) => {
    try {
        const { data } = await api.get(`/aws/buckets/${bucketName}/info`);
        return {success: true, data};
    } catch (error) {
        console.error(error);
        const axError = error as AxiosError<{detail: string}>;
        toast.error(axError.response?.data?.detail || "Error getting bucket info");
        return {success: false, error};
    }
}

const updateBucketConfig = async (bucketName: string, payload: any) => {
    try {
        const { data } = await api.put(`/aws/buckets/${bucketName}/config`, payload);
        return {success: true, data};
    } catch (error) {
        console.error(error);
        const axError = error as AxiosError<{detail: string}>;
        toast.error(axError.response?.data?.detail || "Error updating bucket config");
        return {success: false, error};
    }
}

const downloadFileFromBucket = async (bucketName: string, objectKey: string) => {
    try {
        const url = await getPresignedUrl(bucketName, objectKey);
        await downloadBlobFromUrl(url, objectKey);
        return {success: true};
    } catch (error) {
        console.error(error);
        const axError = error as AxiosError<{detail: string}>;
        toast.error(axError.response?.data?.detail || "Error downloading file");
        return {success: false, error};
    }
}

const deleteFileFromBucket = async (bucketName: string, objectKey: string) => {
    try {
        const { data } = await api.delete(`/aws/buckets/${bucketName}/files/${objectKey}`);
        return {success: true, data};
    } catch (error) {
        console.error(error);
        const axError = error as AxiosError<{detail: string}>;
        return {success: false, error:axError.response?.data?.detail || "Error deleting file"};
    }
}

export const awsApi = {
    listBuckets,
    getBucketFiles,
    uploadFile,
    createBucket,
    deleteBucket,
    getBucketInfo,
    updateBucketConfig,
    downloadFileFromBucket,
    deleteFileFromBucket
}
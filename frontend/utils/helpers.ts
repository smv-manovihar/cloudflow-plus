export function formatFileSize(bytes: number): { value: string; unit: string } {
  // Handle zero or negative bytes
  if (bytes <= 0) {
    return { value: "0", unit: "B" };
  }

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024; // 1 KB = 1024 bytes
  let i = 0;

  // Iterate through units until bytes is less than 1024 or we reach the last unit
  while (bytes >= k && i < units.length - 1) {
    bytes /= k;
    i++;
  }

  // Format value to 2 decimal places if not in bytes, otherwise no decimals
  const formattedValue = i === 0 ? bytes.toFixed(0) : bytes.toFixed(2);

  return {
    value: formattedValue,
    unit: units[i],
  };
}

import { AxiosError } from "axios";

export interface ApiErrorResult {
  success: false;
  error: string;
}

// Unified API error handler
export const handleApiError = (
  error: unknown,
  defaultMessage: string
): ApiErrorResult => {
  const axiosError = error as AxiosError<{ detail?: string; message?: string }>;

  // Don't log 401 errors to console to prevent confusion
  if (axiosError?.response?.status !== 401) {
    console.error(defaultMessage, error);
  }

  const detail = axiosError?.response?.data?.detail;

  const errorMessage =
    typeof detail === "string"
      ? detail
      : axiosError?.response?.data?.message ||
        axiosError?.message ||
        defaultMessage;

  return {
    success: false,
    error: errorMessage,
  };
};

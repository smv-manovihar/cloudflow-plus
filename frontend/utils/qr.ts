import QRCode from "qrcode";

export const generateQrDataUrl = async (text: string): Promise<string | null> => {
  try {
    return await QRCode.toDataURL(text, { width: 320, margin: 2 });
  } catch {
    return null;
  }
};

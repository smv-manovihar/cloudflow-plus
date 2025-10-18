import axios from "axios"

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
});

export const PUBLIC_FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL;
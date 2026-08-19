const STORAGE_KEY = 'siyu-private-access-token'
export const getAccessToken = () => localStorage.getItem(STORAGE_KEY)?.trim() || ''
export function setAccessToken(value: string) { const token = value.trim(); if (token) localStorage.setItem(STORAGE_KEY, token); else localStorage.removeItem(STORAGE_KEY) }
export function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}, fetcher: typeof fetch = fetch) { const headers = new Headers(init.headers); const token = getAccessToken(); if (token) headers.set('Authorization', `Bearer ${token}`); return fetcher(input, { ...init, headers }) }

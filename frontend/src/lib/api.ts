const BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export interface TreeItem {
  path: string;
  type: string;
}

export interface DocFile {
  content: string;
  sha: string;
  path: string;
}

export interface UserInfo {
  login: string;
  avatar_url: string;
  name: string;
  is_admin: boolean;
}

export const api = {
  // Auth
  me: () => request<UserInfo>("/auth/me"),
  loginUrl: () => `${BASE}/auth/login`,

  // Docs
  tree: (locale: string) => request<{ locale: string; items: TreeItem[] }>(`/docs/tree/${locale}`),
  getDoc: (locale: string, path: string) => request<DocFile>(`/docs/file/${locale}/${path}`),
  updateDoc: (locale: string, path: string, content: string, sha: string, message?: string) =>
    request<{ ok: boolean }>(`/docs/file/${locale}/${path}`, {
      method: "PUT",
      body: JSON.stringify({ content, sha, message }),
    }),
  createDoc: (locale: string, path: string, content: string, message?: string) =>
    request<{ ok: boolean }>(`/docs/file/${locale}/${path}`, {
      method: "POST",
      body: JSON.stringify({ content, message }),
    }),
  deleteDoc: (locale: string, path: string, sha: string) =>
    request<{ ok: boolean }>(`/docs/file/${locale}/${path}?sha=${sha}`, { method: "DELETE" }),
  renameDoc: (locale: string, oldPath: string, newPath: string) =>
    request<{ ok: boolean; new_path: string }>(`/docs/rename/${locale}/${oldPath}`, {
      method: "POST",
      body: JSON.stringify({ new_path: newPath }),
    }),
  reorder: (order: string[]) =>
    request<{ ok: boolean }>("/docs/order", {
      method: "PUT",
      body: JSON.stringify({ order }),
    }),

  // Translate
  translate: (content: string, targetLocale: string) =>
    request<{ translated: string }>("/translate", {
      method: "POST",
      body: JSON.stringify({ content, target_locale: targetLocale }),
    }),

  // Users
  getAdmins: () => request<{ admins: string[] }>("/users/admins"),
  updateAdmins: (admins: string[]) =>
    request<{ ok: boolean; admins: string[] }>("/users/admins", {
      method: "PUT",
      body: JSON.stringify({ admins }),
    }),
};

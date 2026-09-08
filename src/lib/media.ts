import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

export const MEDIA_BUCKET = "media";

/**
 * Where the current user's uploads live and what they can list.
 *
 * Suppliers are scoped to a folder named by their user id, so their media
 * library shows only their own files. Admins (and legacy files) use the bucket
 * root and see everything. Returns:
 *   prefix   — folder to upload into ("" for admin, "<uid>/" for supplier)
 *   scoped   — true when the caller should only see their own folder
 *   userId   — the caller's id (for scoped listing)
 */
async function mediaScope(): Promise<{
  prefix: string;
  scoped: boolean;
  userId: string | null;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) return { prefix: "", scoped: false, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  // Only suppliers are folder-scoped. Admins/staff see the whole bucket.
  if (profile?.role === "supplier") {
    return { prefix: `${userId}/`, scoped: true, userId };
  }
  return { prefix: "", scoped: false, userId };
}

/** Hard ceiling — files bigger than this are rejected outright. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
/** Above this, we compress/resize before upload to keep storage lean. */
export const OPTIMIZE_OVER_BYTES = 5 * 1024 * 1024; // 5 MB
/** Longest edge (px) an optimized image is scaled down to. */
const MAX_DIMENSION = 2000;

/**
 * Shrink a large image with a canvas: cap the longest edge and re-encode as
 * JPEG. Returns a new File; falls back to the original if anything fails
 * (e.g. the browser can't decode it) so an upload is never blocked by this.
 */
async function optimizeImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.82)
    );
    // Only use the optimized version if it actually came out smaller.
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Validate an image against the size limit and optimize it when large.
 * Returns the (possibly smaller) file to upload, or an error string.
 */
export async function prepareImage(
  file: File
): Promise<{ file: File | null; error: string | null }> {
  if (!file.type.startsWith("image/")) {
    return { file: null, error: "Only image files are allowed." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return { file: null, error: `Image is ${mb} MB. The limit is 10 MB.` };
  }
  if (file.size > OPTIMIZE_OVER_BYTES) {
    return { file: await optimizeImage(file), error: null };
  }
  return { file, error: null };
}

export type MediaFile = {
  name: string;
  /** Path within the bucket (currently same as name; kept for future folders). */
  path: string;
  url: string;
  size: number;
  createdAt: string | null;
};

const storage = () => supabase.storage.from(MEDIA_BUCKET);

/** Public URL for a stored object. The bucket is public, so this loads directly. */
export function publicUrl(path: string): string {
  return storage().getPublicUrl(path).data.publicUrl;
}

/** A filesystem-safe, collision-resistant name that keeps the extension. */
function safeName(original: string): string {
  const dot = original.lastIndexOf(".");
  const ext = dot >= 0 ? original.slice(dot).toLowerCase() : "";
  const base = (dot >= 0 ? original.slice(0, dot) : original)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "file";
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${base}-${stamp}${rand}${ext}`;
}

export async function uploadFile(
  file: File
): Promise<{ url: string | null; error: string | null }> {
  const prepared = await prepareImage(file);
  if (prepared.error || !prepared.file)
    return { url: null, error: prepared.error };
  const ready = prepared.file;

  const { prefix } = await mediaScope();
  const path = prefix + safeName(ready.name);
  const { error } = await storage().upload(path, ready, {
    cacheControl: "3600",
    contentType: ready.type,
  });
  if (error) return { url: null, error: error.message };
  return { url: publicUrl(path), error: null };
}

/** Largest 3D model we accept (models are not optimized, just size-capped). */
export const MAX_MODEL_BYTES = 30 * 1024 * 1024; // 30 MB

/**
 * Upload a glTF/GLB 3D model. Unlike images these aren't re-encoded — a .glb is
 * already a packed binary — so we only validate the extension and size.
 */
export async function uploadModel3D(
  file: File
): Promise<{ url: string | null; error: string | null }> {
  if (!/\.(glb|gltf)$/i.test(file.name)) {
    return { url: null, error: "Use a .glb or .gltf file." };
  }
  if (file.size > MAX_MODEL_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return { url: null, error: `Model is ${mb} MB. The limit is 30 MB.` };
  }

  const { prefix } = await mediaScope();
  const path = prefix + safeName(file.name);
  const contentType = /\.glb$/i.test(file.name)
    ? "model/gltf-binary"
    : "model/gltf+json";
  const { error } = await storage().upload(path, file, {
    cacheControl: "3600",
    contentType,
  });
  if (error) return { url: null, error: error.message };
  return { url: publicUrl(path), error: null };
}

/**
 * Upload with real progress.
 *
 * The Supabase JS client's upload() gives no progress events, so we POST the
 * file straight to the Storage REST endpoint via XHR and read its
 * upload.onprogress. Auth is the signed-in user's token (uploads are
 * admin-gated), so this must run while logged in.
 */
export async function uploadFileWithProgress(
  file: File,
  onProgress: (percent: number) => void
): Promise<{ url: string | null; error: string | null }> {
  const prepared = await prepareImage(file);
  if (prepared.error || !prepared.file)
    return { url: null, error: prepared.error };
  const ready = prepared.file;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? SUPABASE_ANON_KEY;

  const { prefix } = await mediaScope();
  const path = prefix + safeName(ready.name);
  const endpoint = `${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${path}`;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "3600");
    xhr.setRequestHeader("content-type", ready.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve({ url: publicUrl(path), error: null });
      } else {
        let message = `Upload failed (${xhr.status}).`;
        try {
          message = JSON.parse(xhr.responseText).message ?? message;
        } catch {
          /* keep the default */
        }
        resolve({ url: null, error: message });
      }
    };
    xhr.onerror = () =>
      resolve({ url: null, error: "Network error during upload." });

    xhr.send(ready);
  });
}

/**
 * Overwrite an existing object in place (used when saving an edit).
 *
 * The public URL is unchanged, so the CDN/browser would keep serving the old
 * bytes for up to cacheControl seconds. We return a cache-busted URL
 * (`?v=timestamp`) so the fresh image shows immediately wherever the caller
 * stores it. The bare (unversioned) URL still points at the new file too.
 */
export async function overwriteFile(
  path: string,
  blob: Blob,
  contentType: string
): Promise<{ url: string | null; error: string | null }> {
  const { error } = await storage().upload(path, blob, {
    upsert: true,
    cacheControl: "3600",
    contentType,
  });
  if (error) return { url: null, error: error.message };
  return { url: `${publicUrl(path)}?v=${Date.now()}`, error: null };
}

/** List objects directly under a folder (prefix like "" or "<uid>/"). */
async function listFolder(folder: string): Promise<MediaFile[]> {
  const { data } = await storage().list(folder.replace(/\/$/, ""), {
    limit: 200,
    sortBy: { column: "created_at", order: "desc" },
  });
  return (data ?? [])
    // list() returns placeholder rows for sub-folders (id === null) — skip them.
    .filter((o) => o.id !== null)
    .map((o) => {
      const path = folder + o.name;
      return {
        name: o.name,
        path,
        url: publicUrl(path),
        size: o.metadata?.size ?? 0,
        createdAt: o.created_at ?? null,
      };
    });
}

export async function listFiles(): Promise<{
  files: MediaFile[];
  error: string | null;
}> {
  const { scoped, prefix } = await mediaScope();

  // Suppliers see only their own folder.
  if (scoped) {
    return { files: await listFolder(prefix), error: null };
  }

  // Admins/staff see the bucket root plus every supplier's folder.
  const { data: top, error } = await storage().list("", {
    limit: 200,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) return { files: [], error: error.message };

  const rootFiles: MediaFile[] = (top ?? [])
    .filter((o) => o.id !== null)
    .map((o) => ({
      name: o.name,
      path: o.name,
      url: publicUrl(o.name),
      size: o.metadata?.size ?? 0,
      createdAt: o.created_at ?? null,
    }));

  // Folder rows have id === null; recurse into each to gather supplier uploads.
  const folders = (top ?? [])
    .filter((o) => o.id === null)
    .map((o) => `${o.name}/`);
  const folderFiles = (
    await Promise.all(folders.map((f) => listFolder(f)))
  ).flat();

  const files = [...rootFiles, ...folderFiles].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
  );
  return { files, error: null };
}

export async function deleteFile(path: string): Promise<{ error: string | null }> {
  const { error } = await storage().remove([path]);
  return { error: error?.message ?? null };
}

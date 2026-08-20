import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteFile,
  listFiles,
  overwriteFile,
  uploadFile,
  type MediaFile,
} from "../../lib/media";
import { useToast } from "../../context/ToastContext";
import ImageEditor from "./ImageEditor";

type Props = {
  /** When set, clicking a file selects it (picker mode) instead of just viewing. */
  onPick?: (url: string) => void;
  /** Hide delete controls (e.g. inside the picker). */
  allowDelete?: boolean;
};

export default function MediaGrid({ onPick, allowDelete = true }: Props) {
  const { notify } = useToast();
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MediaFile | null>(null);
  // A newly picked local file being cropped before its first upload.
  const [pendingEdit, setPendingEdit] = useState<{
    url: string;
    name: string;
    file: File;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { files, error } = await listFiles();
    setError(error);
    setFiles(files);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uploadMany = async (files: File[]) => {
    setBusy(true);
    let ok = 0;
    for (const file of files) {
      const { error } = await uploadFile(file);
      if (error) notify("error", `Upload failed: ${file.name}`, error);
      else ok++;
    }
    setBusy(false);
    if (ok > 0) {
      notify("success", "Uploaded", `${ok} file${ok > 1 ? "s" : ""} added.`);
      load();
    }
  };

  /**
   * One upload entry point. A single image opens the editor first (where the
   * crop can be skipped); picking several uploads them straight away, since
   * cropping a batch one-by-one isn't useful.
   */
  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (inputRef.current) inputRef.current.value = "";

    if (files.length === 1 && files[0].type.startsWith("image/")) {
      setPendingEdit({
        url: URL.createObjectURL(files[0]),
        name: files[0].name,
        file: files[0],
      });
      return;
    }
    await uploadMany(files);
  };

  const handleSaveEdit = async (file: MediaFile, blob: Blob) => {
    const { error } = await overwriteFile(file.path, blob, "image/jpeg");
    if (error) {
      notify("error", "Save failed", error);
      return;
    }
    notify("success", "Image updated", `${file.name} was overwritten.`);
    // Refresh so the grid shows the new version (bypassing the cache).
    load();
  };

  const handleSaveNewEdit = async (blob: Blob, name: string) => {
    // Upload the cropped blob as a brand-new file (no original to overwrite).
    const edited = new File([blob], name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
    const { error } = await uploadFile(edited);
    if (error) notify("error", "Upload failed", error);
    else {
      notify("success", "Uploaded", "Edited image added.");
      load();
    }
  };

  const handleDelete = async (file: MediaFile) => {
    if (!window.confirm(`Delete ${file.name}? This cannot be undone.`)) return;
    const { error } = await deleteFile(file.path);
    if (error) notify("error", "Delete failed", error);
    else {
      notify("info", "Deleted", file.name);
      setFiles((list) => list.filter((f) => f.path !== file.path));
    }
  };

  const handleCopyUrl = async (file: MediaFile) => {
    try {
      await navigator.clipboard.writeText(file.url);
      notify("success", "URL copied", file.name);
    } catch {
      // Clipboard API can be blocked (e.g. insecure context) — fall back.
      const ok = window.prompt("Copy this URL:", file.url);
      if (ok !== null) notify("info", "URL", "Copy it from the box.");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center h-11 px-4 text-sm font-medium text-white rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload images"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => handleUpload(e.target.files)}
        />
        <button
          type="button"
          onClick={load}
          className="h-11 ml-auto rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-error-500">{error}</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No media yet. Upload an image to get started.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {files.map((file) => (
            <div
              key={file.path}
              className="relative overflow-hidden border border-gray-200 rounded-lg group dark:border-gray-800"
            >
              <button
                type="button"
                onClick={() => onPick?.(file.url)}
                className={`block w-full aspect-square ${
                  onPick ? "cursor-pointer" : "cursor-default"
                }`}
                title={onPick ? "Select this image" : file.name}
              >
                <img
                  src={file.url}
                  alt={file.name}
                  className="object-cover w-full h-full"
                  loading="lazy"
                  // Same CORS mode the editor uses, so opening Edit reuses
                  // this cached response instead of re-downloading.
                  crossOrigin="anonymous"
                />
                {onPick && (
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white transition opacity-0 bg-black/40 group-hover:opacity-100">
                    Select
                  </span>
                )}
              </button>
              {/* Copy URL — available on every image, including in the picker. */}
              <button
                type="button"
                onClick={() => handleCopyUrl(file)}
                aria-label={`Copy URL for ${file.name}`}
                title="Copy image URL"
                className="absolute flex items-center justify-center w-7 h-7 text-white transition rounded opacity-0 bottom-2 right-2 bg-gray-900/70 group-hover:opacity-100 hover:bg-gray-900"
              >
                {/* copy icon */}
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              {allowDelete && (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(file)}
                    className="absolute px-2 py-1 text-xs text-white transition rounded opacity-0 top-2 left-2 bg-gray-900/70 group-hover:opacity-100 hover:bg-gray-900"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(file)}
                    className="absolute px-2 py-1 text-xs text-white transition rounded opacity-0 top-2 right-2 bg-error-500 group-hover:opacity-100 hover:bg-error-600"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ImageEditor
          src={editing.url}
          isOpen={!!editing}
          onClose={() => setEditing(null)}
          onSave={(blob) => handleSaveEdit(editing, blob)}
        />
      )}

      {pendingEdit && (
        <ImageEditor
          src={pendingEdit.url}
          isOpen={!!pendingEdit}
          onClose={() => {
            URL.revokeObjectURL(pendingEdit.url);
            setPendingEdit(null);
          }}
          onSave={(blob) => handleSaveNewEdit(blob, pendingEdit.name)}
          saveLabel="Crop & upload"
          onSkip={() => uploadMany([pendingEdit.file])}
          skipLabel="Upload without cropping"
        />
      )}
    </div>
  );
}

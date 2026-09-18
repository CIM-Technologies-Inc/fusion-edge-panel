import { useState } from "react";
import Label from "../form/Label";

/** An <img> that reports a broken URL instead of showing a dead icon. */
function SafeImage({ url, alt }: { url: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="flex items-center justify-center w-full h-full px-1 text-center">
        <span className="text-theme-xs text-error-500">Can’t load</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className="object-cover w-full h-full"
      onError={() => setBroken(true)}
    />
  );
}

type Props = {
  /** Raw URL strings from the form, may include blanks. */
  urls: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  /** Opens the media library for a given row. */
  onChoose: (index: number) => void;
  /** Move the image at `from` to `to`, reindexing the rest. */
  onReorder: (from: number, to: number) => void;
  /** Image files dropped onto the card — the form uploads and adds them. */
  onDropFiles?: (files: File[]) => void;
  /** 0–100 while a dropped file uploads, or null when idle. */
  uploadProgress?: number | null;
  error?: string;
};

/** The product's images: a big main preview, a draggable thumbnail strip,
 *  and the URL fields — all in one card. */
export default function ImagePreview({
  urls,
  onAdd,
  onRemove,
  onChoose,
  onReorder,
  onDropFiles,
  uploadProgress,
  error,
}: Props) {
  const isUploading =
    uploadProgress !== null && uploadProgress !== undefined;
  // The thumbnail currently being dragged (original form index), or null.
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // True while a file is being dragged over the file-drop zone.
  const [fileOver, setFileOver] = useState(false);

  /** Pull image files out of a drop event and hand them to the form. */
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setFileOver(false);
    if (!onDropFiles) return;
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length > 0) onDropFiles(files);
  };

  // A file drag carries no "files" list until drop, but the types array does.
  const isFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes("Files");

  // Keep the original index so removal/reorder targets the right form row.
  const filled = urls
    .map((url, index) => ({ url: url.trim(), index }))
    .filter((u) => u.url !== "");

  const main = filled[0];

  const handleDrop = (targetIndex: number) => {
    if (dragging !== null && dragging !== targetIndex) {
      onReorder(dragging, targetIndex);
    }
    setDragging(null);
    setDragOver(null);
  };

  return (
    <div>
      <Label>
        Images <span className="text-error-500">*</span>
      </Label>

      {/* Big main preview — also a drop zone for image files when empty. */}
      {!main ? (
        <div
          onDragOver={(e) => {
            if (onDropFiles && isFileDrag(e)) {
              e.preventDefault();
              setFileOver(true);
            }
          }}
          onDragLeave={() => setFileOver(false)}
          onDrop={handleFileDrop}
          className={`flex flex-col items-center justify-center gap-1 mb-3 border border-dashed rounded-lg aspect-square transition ${
            fileOver
              ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
              : "border-gray-300 dark:border-gray-700"
          }`}
        >
          {isUploading ? (
            <div className="w-3/4">
              <div className="mb-2 text-sm font-medium text-center text-gray-600 dark:text-gray-300">
                Uploading… {uploadProgress}%
              </div>
              <div className="w-full h-2 overflow-hidden bg-gray-200 rounded-full dark:bg-gray-700">
                <div
                  className="h-full transition-all duration-150 rounded-full bg-brand-500"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <span className="text-sm text-gray-400">
                {onDropFiles ? "Drop an image here" : "No image yet"}
              </span>
              <span className="text-theme-xs text-gray-400">
                or use “Choose” below
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="relative mb-3 overflow-hidden border border-gray-200 rounded-xl aspect-square bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]">
          <SafeImage url={main.url} alt="Main image" />
          <span className="absolute px-2 py-0.5 text-theme-xs font-medium text-white rounded top-2 left-2 bg-brand-500">
            Main
          </span>
          <button
            type="button"
            onClick={() => onRemove(main.index)}
            aria-label="Remove main image"
            className="absolute flex items-center justify-center w-6 h-6 text-white transition rounded-full top-2 right-2 bg-error-500 hover:bg-error-600"
          >
            ×
          </button>
        </div>
      )}

      {/* Draggable thumbnail strip — includes the main, so any can be dragged
          into first place to become the new main. */}
      {filled.length > 1 && (
        <>
          <div className="grid grid-cols-5 gap-2 mb-2">
            {filled.map((u, pos) => (
              <div
                key={`${u.index}-${u.url}`}
                draggable
                onDragStart={() => setDragging(u.index)}
                onDragEnter={() => setDragOver(u.index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(u.index)}
                onDragEnd={() => {
                  setDragging(null);
                  setDragOver(null);
                }}
                className={`relative cursor-move overflow-hidden rounded-lg border aspect-square bg-gray-50 transition dark:bg-white/[0.03] ${
                  dragOver === u.index && dragging !== u.index
                    ? "border-brand-500 ring-2 ring-brand-500/30"
                    : pos === 0
                    ? "border-brand-500"
                    : "border-gray-200 dark:border-gray-800"
                } ${dragging === u.index ? "opacity-40" : ""}`}
                title="Drag to reorder"
              >
                <SafeImage url={u.url} alt={`Image ${pos + 1}`} />
                <button
                  type="button"
                  onClick={() => onRemove(u.index)}
                  aria-label={`Remove image ${pos + 1}`}
                  className="absolute flex items-center justify-center w-4 h-4 text-white transition rounded-full opacity-0 top-0.5 right-0.5 bg-error-500 group-hover:opacity-100 hover:bg-error-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="mb-3 text-theme-xs text-gray-400">
            Drag a thumbnail to reorder. The first image is the main one.
          </p>
        </>
      )}

      {/* One row per image slot — pick from the media library (no URL typing). */}
      <div className="space-y-2">
        {urls.map((url, i) => {
          const has = url.trim() !== "";
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChoose(i)}
                className={`flex h-11 flex-1 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
                  error && !has
                    ? "border-error-500 text-error-500"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                }`}
              >
                {has ? (
                  <>
                    <span className="h-6 w-6 shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-white/[0.06]">
                      <SafeImage url={url} alt="" />
                    </span>
                    <span className="truncate">Change image</span>
                  </>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">
                    {i === 0 ? "Choose main image…" : "Choose image…"}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onRemove(i)}
                disabled={urls.length === 1}
                aria-label={`Remove image row ${i + 1}`}
                title="Remove this image"
                className="h-11 shrink-0 rounded-lg border border-gray-300 px-3 text-sm text-gray-500 hover:border-error-500 hover:text-error-500 disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-500 dark:border-gray-700 dark:text-gray-400"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mt-2 text-sm font-medium text-brand-500 hover:text-brand-600"
      >
        + Add image
      </button>

      {error ? (
        <p className="mt-1 text-theme-xs text-error-500">{error}</p>
      ) : (
        <p className="mt-1 text-theme-xs text-gray-400">
          The first image is used on listings and the product hero.
        </p>
      )}
    </div>
  );
}

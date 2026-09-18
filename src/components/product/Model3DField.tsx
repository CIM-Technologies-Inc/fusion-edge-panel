import { useRef, useState } from "react";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Model3DViewer from "./Model3DViewer";
import { uploadModel3D } from "../../lib/media";

type Props = {
  /** Current model URL (may be empty). */
  value: string;
  onChange: (url: string) => void;
  notify: (v: "success" | "error", t: string, m: string) => void;
};

/**
 * Temporarily disabled — the 3D model feature is coming soon. Flip this to
 * false to restore the URL/upload field and live preview below.
 */
const DISABLED = true;

/** Product 3D model: paste a .glb/.gltf URL or upload one, with a live preview. */
export default function Model3DField({ value, onChange, notify }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const url = value.trim();
  const looksValid = /^https?:\/\/|^\//.test(url) && /\.(glb|gltf)(\?.*)?$/i.test(url);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setUploading(true);
    const { url: uploaded, error } = await uploadModel3D(file);
    setUploading(false);

    if (error || !uploaded) {
      notify("error", "Upload failed", error ?? "Could not upload the model.");
      return;
    }
    onChange(uploaded);
    notify("success", "3D model uploaded", file.name);
  };

  if (DISABLED) {
    return (
      <div className="opacity-70">
        <div className="flex items-center gap-2">
          <Label>3D model</Label>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-theme-xs font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
            Coming soon
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 mt-1 border border-dashed border-gray-300 rounded-lg py-6 text-sm text-gray-400 dark:border-gray-700">
          {/* cube icon */}
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
          </svg>
          3D models will be available soon.
        </div>
      </div>
    );
  }

  return (
    <div>
      <Label>3D model</Label>

      <div className="flex gap-2">
        <Input
          value={value}
          placeholder="Model URL (https://… .glb or .gltf)"
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="h-11 shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
        {url && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Remove 3D model"
            title="Remove 3D model"
            className="h-11 shrink-0 rounded-lg border border-gray-300 px-3 text-sm text-gray-500 hover:border-error-500 hover:text-error-500 dark:border-gray-700 dark:text-gray-400"
          >
            ×
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        className="hidden"
        onChange={handleFile}
      />

      {/* Live preview */}
      {url ? (
        looksValid ? (
          <div className="mt-3">
            <Model3DViewer src={url} />
          </div>
        ) : (
          <p className="mt-2 text-theme-xs text-error-500">
            URL should point to a .glb or .gltf file.
          </p>
        )
      ) : (
        <p className="mt-2 text-theme-xs text-gray-400">
          Optional. Paste a link or upload a .glb/.gltf model — buyers can orbit
          and zoom it on the product page.
        </p>
      )}
    </div>
  );
}

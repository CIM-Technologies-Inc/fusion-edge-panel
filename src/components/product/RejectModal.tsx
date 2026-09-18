import { useEffect, useState } from "react";
import { Modal } from "../ui/modal";
import Label from "../form/Label";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90";

type Props = {
  isOpen: boolean;
  /** Product name, shown in the heading. */
  productName?: string;
  busy?: boolean;
  onClose: () => void;
  /** Confirm rejection with an optional reason (empty string = no reason). */
  onConfirm: (reason: string) => void;
};

/** Reject-a-product dialog with a reason box (replaces window.prompt). */
export default function RejectModal({
  isOpen,
  productName,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  // Reset the field whenever the dialog opens.
  useEffect(() => {
    if (isOpen) setReason("");
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md w-full p-6">
      <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
        Reject {productName ? `“${productName}”` : "product"}
      </h3>
      <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
        The company will see this reason and can fix the product and resubmit.
      </p>

      <div>
        <Label>Reason (optional)</Label>
        <textarea
          rows={4}
          value={reason}
          autoFocus
          placeholder="e.g. Add a clearer main image and a full description."
          onChange={(e) => setReason(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button
          type="button"
          onClick={onClose}
          className="h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm(reason.trim())}
          className="h-11 rounded-lg bg-error-500 px-5 text-sm font-medium text-white hover:bg-error-600 disabled:opacity-50"
        >
          {busy ? "Rejecting…" : "Reject product"}
        </button>
      </div>
    </Modal>
  );
}

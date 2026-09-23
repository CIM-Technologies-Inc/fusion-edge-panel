import { Modal } from "../ui/modal";
import MediaGrid from "./MediaGrid";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
  /** Lock the picker to one file kind (e.g. "rfa" for a .rfa-only field). */
  only?: "image" | "rfa";
};

/** A modal wrapper around MediaGrid for choosing (or uploading) a file. */
export default function MediaPicker({ isOpen, onClose, onPick, only }: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-4xl w-full p-6 max-h-[85vh] overflow-y-auto"
    >
      <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
        {only === "rfa" ? "Select an RFA file" : "Media library"}
      </h3>
      <MediaGrid
        onPick={(url) => {
          onPick(url);
          onClose();
        }}
        allowDelete={false}
        only={only}
      />
    </Modal>
  );
}

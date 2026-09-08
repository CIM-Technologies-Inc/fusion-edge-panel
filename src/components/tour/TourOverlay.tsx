import { useEffect, useLayoutEffect, useState } from "react";
import { useTour } from "./TourContext";

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8; // spotlight padding around the target

/** The dim overlay with a spotlight cutout and a tooltip for the current step. */
export default function TourOverlay() {
  const { active, index, steps, next, back, stop } = useTour();
  const step = steps[index];
  const [rect, setRect] = useState<Rect | null>(null);
  const [tick, setTick] = useState(0);

  // Re-measure on scroll/resize so the spotlight tracks the element.
  useEffect(() => {
    if (!active) return;
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
    };
  }, [active]);

  // Find the target element for this step and measure it. Retry briefly in case
  // the page (after navigation) hasn't rendered the element yet.
  useLayoutEffect(() => {
    if (!active || !step) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    let tries = 0;
    let raf = 0;
    const find = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-tour="${step.target}"]`
      );
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (tries++ < 40) {
        raf = window.setTimeout(find, 100); // wait for the element to mount
      } else {
        setRect(null); // give up → show a centered tooltip
      }
    };
    find();
    return () => window.clearTimeout(raf);
  }, [active, step, index, tick]);

  if (!active || !step) return null;

  const isLast = index === steps.length - 1;

  // Tooltip position: near the target, or centered when there's no target.
  const tooltip = tooltipStyle(rect, step.placement);

  return (
    <div className="fixed inset-0 z-[100000]">
      {/* Dim layer. A box-shadow trick lights up the spotlight rectangle. */}
      {rect ? (
        <div
          className="absolute rounded-lg transition-all duration-300 pointer-events-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15, 20, 32, 0.72)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(15,20,32,0.72)]" />
      )}

      {/* Tooltip card */}
      <div
        className="absolute w-[320px] max-w-[calc(100vw-32px)] rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        style={tooltip}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-theme-xs font-medium text-brand-500">
            Step {index + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={stop}
            className="text-theme-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            Skip
          </button>
        </div>
        <h4 className="mb-1 font-semibold text-gray-800 text-title-xs dark:text-white/90">
          {step.title}
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-300">{step.body}</p>

        <div className="flex items-center justify-between gap-2 mt-4">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${
                  i === index
                    ? "bg-brand-500"
                    : "bg-gray-300 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Position the tooltip near the spotlight, clamped to the viewport. */
function tooltipStyle(
  rect: Rect | null,
  placement: "top" | "bottom" | "left" | "right" = "bottom"
): React.CSSProperties {
  const W = 320;
  const H = 210; // approximate; used only for clamping
  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect) {
    return {
      top: Math.max(margin, vh / 2 - H / 2),
      left: Math.max(margin, vw / 2 - W / 2),
    };
  }

  let top = rect.top;
  let left = rect.left;

  switch (placement) {
    case "bottom":
      top = rect.top + rect.height + margin + PAD;
      left = rect.left + rect.width / 2 - W / 2;
      break;
    case "top":
      top = rect.top - H - margin - PAD;
      left = rect.left + rect.width / 2 - W / 2;
      break;
    case "right":
      top = rect.top + rect.height / 2 - H / 2;
      left = rect.left + rect.width + margin + PAD;
      break;
    case "left":
      top = rect.top + rect.height / 2 - H / 2;
      left = rect.left - W - margin - PAD;
      break;
  }

  // Clamp inside the viewport.
  top = Math.min(Math.max(margin, top), vh - H - margin);
  left = Math.min(Math.max(margin, left), vw - W - margin);
  return { top, left };
}

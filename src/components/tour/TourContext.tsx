import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";

/** One step of the guided tour. */
export type TourStep = {
  /** Value of the target's data-tour attribute; null = centered modal. */
  target: string | null;
  title: string;
  body: string;
  /** Route this step lives on. The tour navigates here before showing it. */
  route?: string;
  /** Preferred tooltip placement relative to the target. */
  placement?: "top" | "bottom" | "left" | "right";
};

type TourState = {
  active: boolean;
  index: number;
  steps: TourStep[];
  start: () => void;
  stop: () => void;
  next: () => void;
  back: () => void;
};

const TourContext = createContext<TourState | undefined>(undefined);

/** Mark the tour as completed on the signed-in user's profile (once, ever). */
async function markTourComplete() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profiles")
    .update({ tour_completed_at: new Date().toISOString() })
    .eq("id", user.id);
}

/** The supplier-focused product walkthrough. */
const STEPS: TourStep[] = [
  {
    target: null,
    route: "/",
    title: "Welcome to FusionEdge 👋",
    body: "This quick tour shows how to manage your products — the dashboard, adding a product, attributes, variations, and images. You can skip anytime and replay it later from Help.",
  },
  {
    target: "dashboard-stats",
    route: "/",
    title: "Your dashboard",
    body: "These cards summarise your own products — how many you have, how many are published, in stock, and featured. It only ever shows your products, never other suppliers'.",
    placement: "bottom",
  },
  {
    target: "nav-product",
    route: "/",
    title: "The Product section",
    body: "This is where you manage your catalogue. Click here anytime to see your product list.",
    placement: "right",
  },
  {
    target: "new-product-btn",
    route: "/product",
    title: "Add a product",
    body: "Use “New product” to create one. Let's open it and walk through the important parts.",
    placement: "left",
  },
  {
    target: "product-type",
    route: "/product/new",
    title: "Simple vs. variable",
    body: "A Simple product has one price. A Variable product has options like Color or Size — each combination has its own price and stock. Pick the one that fits.",
    placement: "bottom",
  },
  {
    target: "product-basics",
    route: "/product/new",
    title: "The basics",
    body: "Name, category, brand and company. Picking a Company filters the Brand list. Some categories (like Tiles or Paint) also show required fields you must fill in.",
    placement: "right",
  },
  {
    target: "product-attributes",
    route: "/product/new",
    title: "Attributes",
    body: "Attributes describe a product — like Material or Finish. Global attributes (e.g. Color) are shared; you can also add values that belong only to this product. On a variable product, tick “Used for variations” to turn an attribute into buyable options.",
    placement: "top",
  },
  {
    target: "product-images",
    route: "/product/new",
    title: "Images",
    body: "Add photos by URL or upload them. Drag to reorder — the first image is the main one shown on listings. You can also attach a 3D model.",
    placement: "left",
  },
  {
    target: null,
    route: "/product/new",
    title: "That's it! 🎉",
    body: "Fill in the details and click Create. For variable products, add variations (each combination's price/stock) on the edit page afterwards. You can replay this tour anytime from the Help button.",
  },
];

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  const go = useCallback(
    (i: number) => {
      const step = STEPS[i];
      if (!step) return;
      setIndex(i);
      if (step.route && step.route !== location.pathname) {
        navigate(step.route);
      }
    },
    [location.pathname, navigate]
  );

  const start = useCallback(() => {
    setActive(true);
    go(0);
  }, [go]);

  const stop = useCallback(() => {
    setActive(false);
    // Persist per-user so it never auto-starts again (any device).
    void markTourComplete();
  }, []);

  const next = useCallback(() => {
    if (index >= STEPS.length - 1) {
      stop();
      return;
    }
    go(index + 1);
  }, [index, go, stop]);

  const back = useCallback(() => {
    if (index > 0) go(index - 1);
  }, [index, go]);

  const value = useMemo<TourState>(
    () => ({ active, index, steps: STEPS, start, stop, next, back }),
    [active, index, start, stop, next, back]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

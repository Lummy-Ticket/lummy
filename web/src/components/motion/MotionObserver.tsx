"use client";

import { useEffect } from "react";

const RISE: Keyframe[] = [
  { opacity: 0, transform: "translateY(22px)" },
  { opacity: 1, transform: "none" },
];
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
// Capped, so the tenth card of a long grid does not keep people waiting
const STEP = 70;
const MAX_STEP = 7;

/**
 * Rises `[data-reveal]` elements the first time they scroll into view, and the children
 * of `[data-reveal="stagger"]` one after another. One observer for the whole app; it also
 * picks up elements that appear later (client navigation, tabs), so pages need no wrapper.
 *
 * It holds each element at the first frame of a paused Web Animation rather than setting
 * an attribute: the page may still be hydrating when this runs, and React would flag any
 * attribute it did not render.
 */
export function MotionObserver() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute("data-motion")) return;

    const held = new Map<Element, Animation[]>();
    const hold = (el: Element, i = 0) =>
      el.animate(RISE, { duration: 800, delay: Math.min(i, MAX_STEP) * STEP, easing: EASE_OUT, fill: "backwards" });

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          held.get(e.target)?.forEach((a) => a.play());
          held.delete(e.target);
          io.unobserve(e.target);
        }
      },
      // A little before the fold, so things are already moving as they arrive
      { rootMargin: "0px 0px -8% 0px" }
    );

    const track = (el: Element) => {
      if (held.has(el)) return;
      const targets = el.getAttribute("data-reveal") === "stagger" ? Array.from(el.children) : [el];
      const anims = targets.map((t, i) => {
        const a = hold(t, i);
        a.pause();
        return a;
      });
      held.set(el, anims);
      io.observe(el);
    };
    const scan = (node: ParentNode) => {
      if (node instanceof Element && node.hasAttribute("data-reveal")) track(node);
      node.querySelectorAll("[data-reveal]").forEach(track);
    };

    scan(document);
    // CSS hid everything until now; from here the paused animations hold it
    root.setAttribute("data-motion-ready", "");

    // Runs before the next paint, so new elements never flash in before being held
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          // A new item in a list that has already come in (a filter changed) rises on its own
          const parent = n.parentElement;
          if (parent?.getAttribute("data-reveal") === "stagger" && !held.has(parent)) hold(n);
          scan(n);
        });
        r.removedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          for (const el of held.keys()) {
            if (n === el || n.contains(el)) {
              held.delete(el);
              io.unobserve(el);
            }
          }
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      held.forEach((anims) => anims.forEach((a) => a.cancel()));
    };
  }, []);

  return null;
}

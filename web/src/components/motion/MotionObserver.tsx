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
 * picks up elements that appear later (client navigation, tabs, filters), so pages need no
 * wrapper.
 *
 * Nothing waits for JavaScript. At load, whatever is already on screen stays as it is and
 * only what is still below the fold is held, which nobody can see happen. Elements added
 * later are held before their first paint, then rise as they come into view.
 *
 * It holds each element at the first frame of a paused Web Animation rather than setting
 * an attribute, so nothing React rendered is touched and hydration stays clean.
 */
export function MotionObserver() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const held = new Map<Element, Animation[]>();
    // Elements people have already seen: left alone at load, or already risen. React can move
    // a subtree in the DOM (it does on How it works after hydration), and a moved element must
    // not be hidden and played again.
    const shown = new WeakSet<Element>();
    const markShown = (el: Element) => {
      shown.add(el);
      if (el.getAttribute("data-reveal") === "stagger") Array.from(el.children).forEach((c) => shown.add(c));
    };
    const hold = (el: Element, i = 0) =>
      el.animate(RISE, { duration: 800, delay: Math.min(i, MAX_STEP) * STEP, easing: EASE_OUT, fill: "backwards" });

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          held.get(e.target)?.forEach((a) => a.play());
          markShown(e.target);
          held.delete(e.target);
          io.unobserve(e.target);
        }
      },
      // Once an element is a little way into view (8% up from the bottom edge), so it rises
      // where it can be seen rather than just below the fold
      { rootMargin: "0px 0px -8% 0px" }
    );

    const onScreen = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    };
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
    const scan = (node: ParentNode, atLoad: boolean) => {
      const found: Element[] = node instanceof Element && node.hasAttribute("data-reveal") ? [node] : [];
      node.querySelectorAll("[data-reveal]").forEach((el) => found.push(el));
      for (const el of found) {
        if (shown.has(el) || held.has(el)) continue;
        // At load, what is already painted on screen is left alone: hiding it now would flash.
        if (atLoad && onScreen(el)) markShown(el);
        else track(el);
      }
    };

    scan(document, true);

    // Runs before the next paint, so new elements never flash in before being held
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          // A new item in a list that has already come in (a filter changed) rises on its own;
          // an item that was only moved (a sort) stays put
          const parent = n.parentElement;
          if (parent?.getAttribute("data-reveal") === "stagger" && shown.has(parent) && !shown.has(n)) {
            hold(n);
            shown.add(n);
          }
          scan(n, false);
        });
        r.removedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          // Cancel, not just forget: a paused animation left on an element that comes back
          // (a move) would hold it at opacity 0 for good.
          for (const [el, anims] of held) {
            if (n === el || n.contains(el)) {
              anims.forEach((a) => a.cancel());
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

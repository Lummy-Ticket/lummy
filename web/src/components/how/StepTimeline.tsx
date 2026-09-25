"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "idle" | "held" | "open" | "done";

export type Step = {
  Icon: LucideIcon;
  title: string;
  body: ReactNode;
  /** Where things stand after this step, in a few words. Shown inline on phones. */
  state: string;
  tone: Tone;
};

export const TONE_CHIP: Record<Tone, string> = {
  idle: "bg-secondary-gray-soft text-neutral-gray",
  held: "bg-secondary-blue-soft text-lummy-500",
  open: "bg-secondary-orange-soft text-secondary-orange-dark",
  done: "bg-secondary-green-light text-secondary-green-dark-extra",
};

/**
 * Steps read top to bottom, with the thread between them filling in as you scroll. On
 * desktop an example sits beside them and follows along: `aside(active)` renders it for
 * whichever step is in the middle of the screen.
 */
export function StepTimeline({ steps, aside }: { steps: Step[]; aside: (active: number) => ReactNode }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    // The step being read is the last one whose top has passed a line in the upper third of
    // the screen. Measured on scroll rather than with an observer, so a fast flick or a
    // jump to an anchor cannot skip a step.
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let at = 0;
      refs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= line) at = i;
      });
      setActive(at);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [steps.length]);

  const last = steps.length - 1;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-10 xl:gap-16 items-start">
      {/* Extra room under the last step on desktop, so the example stays in view while it is read */}
      <ol className="relative lg:pb-72">
        {/* The thread: dashed ahead, solid up to the step being read */}
        <span aria-hidden className="absolute left-[23px] top-6 bottom-6 lg:bottom-[calc(18rem+1.5rem)] border-l-2 border-dashed border-neutral-light-gray-1" />
        <span
          aria-hidden
          className="absolute left-[23px] top-6 bottom-6 lg:bottom-[calc(18rem+1.5rem)] w-0.5 bg-primary-navy origin-top transition-transform duration-500"
          style={{ transform: `scaleY(${last ? active / last : 1})` }}
        />
        {steps.map((s, i) => {
          const state = i < active ? "done" : i === active ? "now" : "next";
          return (
            <li
              key={s.title}
              ref={(el) => { refs.current[i] = el; }}
              className={cn("relative flex gap-5 pb-10 lg:pb-14 last:pb-0 transition-opacity duration-500", state === "next" && "lg:opacity-60")}
            >
              <span
                className={cn(
                  "relative z-10 w-12 h-12 shrink-0 rounded-full grid place-items-center border-2 transition-colors duration-300",
                  state === "done" && "bg-primary-navy border-primary-navy text-white",
                  state === "now" && "bg-primary-sky border-primary-navy text-primary-navy-dark shadow-[3px_3px_0_#245397]",
                  state === "next" && "bg-neutral-white border-neutral-light-gray-1 text-neutral-gray"
                )}
              >
                {state === "done" ? <Check className="w-5 h-5" /> : <s.Icon className="w-5 h-5" />}
              </span>
              <div className="min-w-0 pt-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-navy">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="font-fredoka font-semibold text-xl text-neutral-black mt-0.5">{s.title}</h3>
                <div className="text-neutral-gray mt-1.5 leading-relaxed max-w-xl">{s.body}</div>
                <span className={cn("lg:hidden inline-flex mt-3 px-2.5 py-1 rounded-full text-xs font-medium", TONE_CHIP[s.tone])}>{s.state}</span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="hidden lg:block sticky top-40">{aside(active)}</div>
    </div>
  );
}

/** Four stops in a row, filled up to `at`. The same picture the order page uses for money. */
export function MiniTrack({ stops, at, settledTone = "done" }: { stops: string[]; at: number; settledTone?: "done" | "back" }) {
  return (
    <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${stops.length}, minmax(0, 1fr))` }}>
      {stops.map((label, i) => {
        const reached = i <= at;
        return (
          <li key={label} className="relative flex flex-col items-center gap-1.5 text-center">
            {i < stops.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-[7px] left-[calc(50%+10px)] right-[calc(-50%+10px)] border-t-2 transition-colors duration-500",
                  i < at ? "border-primary-navy" : "border-dashed border-neutral-light-gray-1"
                )}
              />
            )}
            <span
              className={cn(
                "relative w-4 h-4 rounded-full border-2 transition-all duration-500",
                reached
                  ? i === at && settledTone === "back"
                    ? "bg-neutral-gray border-neutral-gray"
                    : "bg-primary-navy border-primary-navy"
                  : "bg-neutral-white border-neutral-light-gray-1",
                i === at && "scale-125"
              )}
            />
            <span className={cn("text-[11px] leading-tight transition-colors", reached ? "text-neutral-black font-medium" : "text-neutral-gray")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

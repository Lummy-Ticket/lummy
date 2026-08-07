"use client";

import { cn } from "@/lib/utils";

type DualRangeSliderProps = {
    min: number;
    max: number;
    step?: number;
    valueMin: number;
    valueMax: number;
    onChange: (min: number, max: number) => void;
    className?: string;
};

// Two overlapping native range inputs with a shared colored track between the
// thumbs. Thumb styling lives in globals.css (.dual-range-input).
export function DualRangeSlider({
    min,
    max,
    step = 1,
    valueMin,
    valueMax,
    onChange,
    className,
}: DualRangeSliderProps) {
    const span = Math.max(1, max - min);
    const minPct = ((valueMin - min) / span) * 100;
    const maxPct = ((valueMax - min) / span) * 100;

    return (
        <div className={cn("relative h-5 flex items-center", className)}>
            <div className="absolute w-full h-2 bg-neutral-light-gray-2 rounded-full" />
            <div
                className="absolute h-2 bg-lummy-500 rounded-full"
                style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
            />

            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={valueMin}
                onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax - step), valueMax)}
                className="dual-range-input"
                style={{ zIndex: minPct > 60 ? 5 : 3 }}
                aria-label="Minimum"
            />

            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={valueMax}
                onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin + step))}
                className="dual-range-input"
                style={{ zIndex: 4 }}
                aria-label="Maximum"
            />
        </div>
    );
}

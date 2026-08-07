import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const BADGE_COLOR_CLASS = {
  BLUE: "bg-secondary-blue-soft text-lummy-500",
  GREEN: "bg-secondary-green-light text-secondary-green-dark",
  RED: "bg-secondary-pink-soft text-secondary-pink-dark",
  INDIGO: "bg-secondary-indigo-soft text-secondary-indigo-dark",
  YELLOW: "bg-secondary-yellow-soft text-secondary-yellow-dark-extra",
}
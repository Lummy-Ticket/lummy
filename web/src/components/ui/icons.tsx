"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface IconProps {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  variant?: "default" | "lummy" | "accent" | "success" | "warning" | "danger";
  className?: string;
}

const sizeClasses = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-8 h-8",
  "2xl": "w-10 h-10",
};

const variantClasses = {
  default: "text-gray-600",
  lummy: "text-lummy-600",
  accent: "text-accent-500",
  success: "text-success-500",
  warning: "text-yellow-500",
  danger: "text-red-500",
};

export function Icon({ name, size = "md", variant = "default", className }: IconProps) {
  // Import the specific Lucide icon dynamically
  const IconComponent = require(`lucide-react`)[name] as LucideIcon;

  if (!IconComponent) {
    console.warn(`Icon "${name}" not found in lucide-react`);
    return null;
  }

  return (
    <IconComponent
      className={cn(
        sizeClasses[size],
        variantClasses[variant],
        "shrink-0",
        className
      )}
    />
  );
}

// Brand-specific icon components
export function LummyLogo({ size = "md", className }: Omit<IconProps, "name" | "variant">) {
  return (
    <svg
      width={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      height={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <rect width="24" height="24" rx="6" fill="url(#lummy-gradient)" />
      <path
        d="M7 12L10 15L17 8"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="lummy-gradient" x1="0" y1="0" x2="24" y2="24">
          <stop stopColor="#4B6EFF" />
          <stop offset="1" stopColor="#3B5EED" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function SparklesIcon({ size = "md", className }: Omit<IconProps, "name" | "variant">) {
  return (
    <svg
      width={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      height={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <path
        d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
        fill="currentColor"
        fillOpacity="0.8"
      />
      <path
        d="M19 15L20 18L23 19L20 20L19 23L18 20L15 19L18 18L19 15Z"
        fill="currentColor"
        fillOpacity="0.6"
      />
      <path
        d="M5 5L6 8L9 9L6 10L5 13L4 10L1 9L4 8L5 5Z"
        fill="currentColor"
        fillOpacity="0.4"
      />
    </svg>
  );
}

export function TicketIcon({ size = "md", className }: Omit<IconProps, "name" | "variant">) {
  return (
    <svg
      width={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      height={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <path
        d="M20 7H4C3.45 7 3 7.45 3 8V9C3 9.55 3.45 10 4 10C4.55 10 5 10.45 5 11C5 11.55 4.55 12 4 12C3.45 12 3 12.45 3 13V14C3 14.55 3.45 15 4 15H20C20.55 15 21 14.55 21 14V13C21 12.45 20.55 12 20 12C19.45 12 19 11.55 19 11C19 10.45 19.45 10 20 10C20.55 10 21 9.55 21 9V8C21 7.45 20.55 7 20 7Z"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M7 10V12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17 10V12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WalletIcon({ size = "md", className }: Omit<IconProps, "name" | "variant">) {
  return (
    <svg
      width={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      height={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <path
        d="M21 12V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V5C3 3.9 3.9 3 5 3H16C17.1 3 18 3.9 18 5V6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 12V7C21 5.9 20.1 5 19 5H18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 12H21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Animated loading icon
export function LoadingIcon({ size = "md", className }: Omit<IconProps, "name" | "variant">) {
  return (
    <svg
      width={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      height={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("animate-spin", className)}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray="40 100"
        strokeLinecap="round"
        opacity="0.3"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray="40 100"
        strokeLinecap="round"
        transform="rotate(45 12 12)"
      />
    </svg>
  );
}

// Social media icons
export function DiscordIcon({ size = "md", className }: Omit<IconProps, "name" | "variant">) {
  return (
    <svg
      width={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      height={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0463-.319 13.5809.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.2260-1.9942a.0760.0760 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.0760.0760 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5491-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.975 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

export function TwitterIcon({ size = "md", className }: Omit<IconProps, "name" | "variant">) {
  return (
    <svg
      width={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      height={size === "xs" ? "12" : size === "sm" ? "16" : size === "md" ? "20" : size === "lg" ? "24" : size === "xl" ? "32" : "40"}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
    </svg>
  );
}
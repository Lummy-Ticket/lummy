import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        "fredoka": ["Fredoka", "system-ui", "sans-serif"],
        "sans": ["system-ui", "sans-serif"],
      },
      colors: {
        // Primary Colors
        primary: {
          "navy": "#3A6CB4", // Text, Button, Logo, Icons
          "navy-dark": "#245397",
          "sky": "#B1E7FF",   // Button, Logo, Illustrations
        },

        // Secondary Colors
        secondary: {
          "pink": {
            "light": "#FFEDF1",
            "dark": "#E56083",
            "soft": "#FFEBF9"
          },          
          "cream": {
            "light": "#FFF9EF",
            "soft": "#FFF4E2"
          },
          "blue":{
            "light": "#F0FAFF",
            "soft": "#DCEFF8",
            "soft-light": "#DFF5FF",
            "extra": "#FBFEFF"
          },
          "indigo": {
            "dark": "#4B4BB4",
            "soft": "#E8E8FF",
          },
          "gold": {
            "soft": "#FFF6E5",
            "dark": "#E5B000"
          },
          "orange": {
            "soft": "#FFF5F2",
            "dark": "#FF7A27"
          },
          "brown": {
            "soft": "#FFF4E6",
            "dark": "#AA653A"
          },
          "purple": {
            "soft": "#FFE6FB",
            "dark": "#B441AD"
          },
          "green": {
            "light": "#EBFFEF",
            "soft": "#E6F7FF",
            "dark": "#309C9C",
            "dark-extra": "#2DAE76"
          },
          "gray": {
            "dark": "#6F8E9D",
            "light": "#C9D0DA",
            "soft": "#F5F7FA",
          },
          "yellow": {
            "soft": "#FFF4E2",
            "dark": "#FFD846",
            "dark-extra": "#EBC433",
          },
        },

        // Neutral Colors
        neutral: {
          "black": "#333333",        // Text, Icons
          "gray": "#7B8491",          // Text, Icons
          "disabled-gray": "#B9C6DA", // Text, Card
          "light-gray-1": "#D2D2D2",  // Text, Line
          "light-gray-2": "#F0F0F0",  // Background
          "white": "#FFFFFF",          // Text, Icons, Background, Card
        },

        // Legacy color compatibility
        lummy: {
          50: "#F0FAFF",
          100: "#DCEFF8",
          200: "#B1E7FF",
          300: "#3A6CB4",
          400: "#3A6CB4",
          500: "#3A6CB4", // Primary Navy Blue
          600: "#2E5A99",
          700: "#23477A",
          800: "#17345C",
          900: "#0B213E",
          950: "#05182F",
        },

        // Pastel category colors
        pastel: {
          "pink": "#FF9FB9",
          "blue": "#B1E7FF",
          "yellow": "#FFF4E2",
          "purple": "#F0FAFF",
          "green": "#FFF9EF",
          "orange": "#FFEDF1",
        },

        // Status colors
        success: {
          50: "#ECFDF5",
          100: "#D1FAE5",
          200: "#A7F3D0",
          300: "#6EE7B7",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
          800: "#065F46",
          900: "#064E3B",
        },

        danger: {
          50: "#FEF2F2",
          100: "#FEE2E2",
          200: "#FECACA",
          300: "#FCA5A5",
          400: "#F87171",
          500: "#EF4444",
          600: "#DC2626",
          700: "#B91C1C",
          800: "#991B1B",
          900: "#7F1D1D",
        },

        warning: {
          50: "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
          800: "#92400E",
          900: "#78350F",
        },

        info: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
        },

        // Standard grays
        gray: {
          50: "#F9FAFB",
          100: "#F3F4F6",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#6B7280",
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#111827",
        },
      },
      backgroundImage: {
        "lummy-gradient": "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
        "lummy-gradient-reverse": "linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)",
        "hero-gradient": "linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 50%, #dbeafe 100%)",
      },
      boxShadow: {
        "lummy": "0 4px 14px 0 rgba(30, 58, 138, 0.15)",
        "lummy-lg": "0 10px 40px 0 rgba(30, 58, 138, 0.2)",
      },
      borderRadius: {
        "lummy": "12px",
        "lummy-xl": "16px",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.6s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      width: {
        "card": {
          "event" : "303px",
          "ticket-marketplace": "414px",
          "myticket": "415px",
        },
        "modal": {
          "confirmation": "466px",
          "regular": "480px"
        }
      },
      height: {
        "card": {
          "event" : "367px",
          "ticket-marketplace": "408px",
          "myticket": "289px",
          "testimonial": "206px",
        },
        "modal": {
          "regular": "648px"
        }
      },
      minHeight: {
        "card": {
          "event" : "367px",
          "ticket-marketplace": "408px",
          "myticket": "289px",
          "testimonial": "206px",
        }
      },
      maxWidth: {
        "card": {
          "event" : "303px",
          "ticket-marketplace": "414px",
          "myticket": "415px",
        }
      },
      minWidth: {
        "card": {
          "event" : "303px",
          "ticket-marketplace": "414px",
          "myticket": "415px",
        }
      }
    },
  },
  plugins: [],
};

export default config;
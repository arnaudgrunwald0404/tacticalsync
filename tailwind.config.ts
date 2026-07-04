import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        heading: ["'Atkinson Hyperlegible'", 'var(--font-heading)', 'sans-serif'],
        body: ["'Public Sans'", 'var(--font-body)', 'sans-serif'],
        sans: ["'Public Sans'", 'var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'],
        mono: ['"Fira Code"', '"Courier New"', 'monospace'],
      },
      gridTemplateColumns: {
        '24': 'repeat(24, minmax(0, 1fr))',
      },
      colors: {
        // Brand color palette — use these instead of hardcoded hex values
        copper: {
          DEFAULT: "hsl(var(--color-copper))",
          hover: "hsl(var(--color-copper-hover))",
        },
        titanium: {
          DEFAULT: "hsl(var(--color-titanium))",
          hover: "hsl(var(--color-titanium-hover))",
        },
        platinum: "hsl(var(--color-platinum))",
        "white-gold": "hsl(var(--color-white-gold))",
        "cast-iron": "hsl(var(--color-cast-iron))",
        "rose-gold": "hsl(var(--color-rose-gold))",
        bronze: "hsl(var(--color-bronze))",
        verdigris: {
          DEFAULT: "hsl(var(--color-verdigris))",
          hover: "hsl(var(--color-verdigris-hover))",
        },
        steel: "hsl(var(--color-steel))",
        pewter: "hsl(var(--color-pewter))",
        brass: "hsl(var(--color-brass))",
        alloy: '#FFA680',
        success: "hsl(var(--color-success))",
        warning: "hsl(var(--color-warning))",
        error: "hsl(var(--color-error))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "inbox-flash": {
          "0%":   { backgroundColor: "rgb(221 214 254)" }, // violet-200
          "60%":  { backgroundColor: "rgb(237 233 254)" }, // violet-100
          "100%": { backgroundColor: "transparent" },
        },
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "inbox-flash": "inbox-flash 1.8s ease-out forwards",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;

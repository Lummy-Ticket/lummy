import * as React from "react"
import { cn } from "@/lib/utils"

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>

type AdditionalProps = ButtonProps & {
  wrapperClass?: string
}

const Primary = React.forwardRef<HTMLButtonElement, AdditionalProps> (({className, children, wrapperClass, ...props}, ref) => {
  
  return (
    <div className={cn(wrapperClass)}>
      <div className={cn("relative mt-0.5 w-fit border-lummy-500 rounded-2xl", props.disabled ? "bg-neutral-gray" : "bg-primary-navy-dark", className)}>
        <button 
          ref={ref}
          className={cn("enabled:cursor-pointer bg-primary-sky hover:bg-primary-navy hover:text-neutral-white hover:border-primary-navy-dark disabled:bg-neutral-light-gray-1 disabled:text-neutral-gray rounded-2xl border-2 transition duration-200 enabled:hover:-translate-x-0.5 enabled:hover:-translate-y-0.5 -translate-y-1 -translate-x-1 enabled:active:translate-0 disabled:border-neutral-gray font-fredoka font-semibold text-primary-navy-dark border-lummy-500 px-6 py-3.5", className)}
          {...props}
        >
          {children}
        </button>
      </div>
    </div>
  );
});

const Secondary = React.forwardRef<HTMLButtonElement, AdditionalProps> (({className, children, wrapperClass, ...props}, ref) => {

  return (
    <div className={cn(wrapperClass)}>
      <div className={cn("relative mt-0.5 w-fit border-lummy-500 rounded-2xl", props.disabled ? "bg-neutral-gray" : "bg-primary-navy-dark", className)}>
        <button 
          ref={ref}
          className={cn("enabled:cursor-pointer bg-neutral-white hover:bg-pastel-yellow disabled:bg-neutral-light-gray-1 disabled:text-neutral-gray rounded-2xl border-2 transition duration-200 enabled:hover:-translate-x-0.5 enabled:hover:-translate-y-0.5 -translate-y-1 -translate-x-1 enabled:active:translate-0 disabled:border-neutral-gray font-fredoka font-medium text-lummy-500 border-lummy-500 px-6 py-3.5", className)} 
          {...props}
        >
          {children}
        </button>
      </div> 
    </div>
  );
});

type GhostProps = ButtonProps & {
  /** neutral: back, cancel. danger: reject, remove. warning: a risky action someone may still take. */
  tone?: "neutral" | "danger" | "warning"
}

// The quiet action beside a Primary: same height and radius, no raised shadow.
// Use it for back, cancel and reject so every screen reads the same way.
const GHOST_TONE = {
  neutral: "border-neutral-light-gray-1 text-neutral-gray enabled:hover:border-primary-navy enabled:hover:text-primary-navy",
  danger: "border-neutral-light-gray-1 text-neutral-gray enabled:hover:border-secondary-pink-dark enabled:hover:text-secondary-pink-dark",
  warning: "border-secondary-orange-dark text-secondary-orange-dark enabled:hover:bg-secondary-orange-soft",
} as const;

const Ghost = React.forwardRef<HTMLButtonElement, GhostProps>(({ className, children, tone = "neutral", type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-2xl border-2 bg-neutral-white px-5 py-3.5 font-fredoka font-medium transition enabled:cursor-pointer enabled:active:scale-[0.97] disabled:opacity-50 -translate-y-0.5",
      GHOST_TONE[tone],
      className
    )}
    {...props}
  >
    {children}
  </button>
));

Primary.displayName = "Button.Primary";
Secondary.displayName = "Button.Secondary";
Ghost.displayName = "Button.Ghost";

const Button = {
  Primary,
  Secondary,
  Ghost,
}

export {Button}
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
          className={cn("enabled:cursor-pointer bg-primary-sky hover:bg-primary-navy hover:text-neutral-white hover:border-primary-navy-dark disabled:bg-neutral-light-gray-1 disabled:text-neutral-gray rounded-2xl border-2 transition ease-in-out enabled:hover:-translate-x-0.5 enabled:hover:-translate-y-0.5 -translate-y-1 -translate-x-1 enabled:active:translate-0 disabled:border-neutral-gray font-fredoka font-medium text-lummy-500 border-lummy-500 px-6 py-3.5", className)} 
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
          className={cn("enabled:cursor-pointer bg-neutral-white hover:bg-pastel-yellow disabled:bg-neutral-light-gray-1 disabled:text-neutral-gray rounded-2xl border-2 transition ease-in-out enabled:hover:-translate-x-0.5 enabled:hover:-translate-y-0.5 -translate-y-1 -translate-x-1 enabled:active:translate-0 disabled:border-neutral-gray font-fredoka font-medium text-lummy-500 border-lummy-500 px-6 py-3.5", className)} 
          {...props}
        >
          {children}
        </button>
      </div> 
    </div>
  );
});

const Button = {
  Primary,
  Secondary
}

export {Button}
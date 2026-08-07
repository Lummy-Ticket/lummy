import * as React from "react"
import { cn } from "@/lib/utils"
import { MdCheckBox, MdCheckBoxOutlineBlank } from "react-icons/md"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id:string,
  childrenPosition?: "left" | "right",
  inputClass?: string
}

export interface SelectProps {
  id:string,
  childrenPosition?: "left" | "right"
  placeholder?: string
  children?: React.ReactNode
  defaultValue?: string,
  onChange: (value: string) => void
  value?: string
  className?: string
  data: {
    value: string,
    label: string
  }[]
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  id:string,
  rows?: number,
}

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id:string,
  checked?: boolean,
  labelPosition?: "left" | "right",
  label:string,
  onToggles: (isChecked: boolean) => void
}

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id:string,
  checked?: boolean,
  onToggles: (isChecked: boolean) => void
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, id, placeholder, children, childrenPosition = "left", defaultValue, inputClass, value, onChange, ...props }, ref) => {
    // If parent passes `value` the input is controlled; otherwise the input stays
    // uncontrolled (with optional defaultValue). Either path keeps the DOM and
    // parent state in sync and lets react-hook-form's register()/setValue() work.
    const isControlled = value !== undefined

    return (
      <div onClick={() => document.getElementById(id)?.focus()} className={cn('flex items-center gap-2 py-3.5 px-5 rounded-xl transition ease-in-out ring-1 ring-lummy-500 focus-within:ring-2 text-sm xl:text-base', (childrenPosition == "right") && "flex-row-reverse", className)}>
          {children}

          <input
            ref={ref}
            id={id}
            type={type}
            {...(isControlled ? { value } : {})}
            {...(!isControlled && defaultValue !== undefined ? { defaultValue } : {})}
            onChange={onChange}
            placeholder={placeholder}
            className={cn(
              'outline-none w-full text-neutral-black placeholder:text-secondary-gray-light disabled:text-neutral-gray',
              inputClass,
            )}
            {...props}
          />
      </div>
    )
  }
)

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, id, placeholder, children, defaultValue, rows = 3, value, onChange, ...props }, ref) => {
    const isControlled = value !== undefined

    return (
      <div onClick={() => document.getElementById(id)?.focus()} className={cn('flex items-center gap-2 py-3.5 px-5 rounded-xl transition ease-in-out ring-1 ring-lummy-500 focus-within:ring-2 text-sm xl:text-base', className)}>
          {children}

          <textarea
            rows={rows}
            ref={ref}
            id={id}
            {...(isControlled ? { value } : {})}
            {...(!isControlled && defaultValue !== undefined ? { defaultValue } : {})}
            onChange={onChange}
            placeholder={placeholder}
            className='outline-none w-full text-neutral-black placeholder:text-secondary-gray-light disabled:text-neutral-gray'
            {...props}
          />
      </div>
    )
  }
)

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, type, id, placeholder, children, labelPosition = "right", checked = false, defaultValue, label, onToggles,...props }, ref) => {
    const [isChecked, setIsChecked] = React.useState(checked)

    React.useEffect(() => {
      onToggles(isChecked)
    }, [isChecked])

    return (
      <div onClick={() => setIsChecked(!isChecked)} className={cn('relative flex items-center gap-2 text-sm xl:text-base', (labelPosition == "left") && "flex-row-reverse", className)} {...props}>
          <MdCheckBox className={cn("absolute text-lummy-500 w-5 h-5 cursor-pointer opacity-0 transition ease-in-out duration-75", isChecked && "opacity-100")} />
          <MdCheckBoxOutlineBlank className="absolute text-lummy-500 w-5 h-5 cursor-pointer" />
          
          <label className="text-neutral-gray pl-7" htmlFor={id}>
            {label}
          </label>
      </div>
    )
  }
)

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, type, id, placeholder, children, checked = false, defaultValue, onToggles,...props }, ref) => {
    const [isChecked, setIsChecked] = React.useState(checked)

    // Resync when `checked` changes from outside (e.g. this Switch instance is
    // reused across different data, like switching between two events'
    // Settings tabs) — otherwise the toggle can visually go stale.
    React.useEffect(() => {
      setIsChecked(checked)
    }, [checked])

    // Call onToggles directly from the click handler, not from an effect on
    // isChecked. An effect fires once on mount even though nothing changed,
    // and under React StrictMode's dev double-invoke it fires twice — a
    // "skip the first fire" ref guard only absorbs one of those two, so the
    // second still slips through and calls onToggles with no user action.
    // A click handler only ever runs on a real user click.
    const handleClick = () => {
      const next = !isChecked
      setIsChecked(next)
      onToggles(next)
    }

    return (
      <div onClick={handleClick} className={cn('relative cursor-pointer transition ease-in-out flex px-0.5 items-center w-9 h-5 bg-neutral-light-gray-1 rounded-full ring-neutral-gray ring-2 text-sm xl:text-base', isChecked && "bg-lummy-500 ring-lummy-600",className)} {...props}>
        <div className={cn("absolute w-4 h-4 transition ease-in-out bg-neutral-white rounded-full", isChecked && "translate-x-full")} />
      </div>
    )
  }
)


const Select = React.forwardRef<HTMLDivElement, SelectProps>(({ className, id, placeholder = "Select", children, data, childrenPosition = "left", defaultValue = "", value, onChange, ...props }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false)

    const wrapperDropdownRef = React.useRef<HTMLDivElement>(null)

    // Close after a selection commits (value changes).
    React.useEffect(() => {
        setIsOpen(false)
    }, [value])

    const handleSelect = (select: { value: string, label: string }) => {
        if (onChange) onChange(select.value)
        setIsOpen(false)
    }

    return (
        <div
            ref={wrapperDropdownRef}
            className={cn('flex relative cursor-default transition h-11 sm:h-[52px] ease-in-out text-sm xl:text-base', isOpen && 'z-30', className)}
            tabIndex={-1}
            onBlur={(e) => {
                if (!wrapperDropdownRef?.current?.contains(e.relatedTarget)) {
                    setIsOpen(false)
                }
            }}
            {...props}
        >
            <div
                onClick={() => setIsOpen((o) => !o)}
                className={cn("flex items-center cursor-pointer justify-between w-full gap-2 border border-lummy-500 bg-neutral-white px-4 z-20 transition", (childrenPosition == "right") && "flex-row-reverse", isOpen ? "rounded-t-xl border-b-0" : "rounded-xl")}
            >
                {children}

                <span className={cn("text-neutral-gray text-nowrap overflow-hidden")}>{value ? data.find((val) => val.value == value)?.label : placeholder}</span>
            </div>

            <div className={cn('absolute top-full left-0 bg-neutral-white border border-t-0 border-lummy-500 w-full z-20 rounded-b-xl overflow-hidden', isOpen ? 'block' : 'hidden')}>
                {
                    data.length > 0 &&
                    data.map((select, i) => (
                        <div onClick={(e) => { e.stopPropagation(); handleSelect(select); }} key={i} className={cn("cursor-pointer hover:bg-secondary-blue-light p-2 transition ease-in-out text-neutral-black", i + 1 == data.length && "rounded-b-xl")}>
                            {select.label}
                        </div>
                    ))
                }
            </div>
      </div>
    )
  }
)

export { 
  Input, 
  Select, 
  Textarea,
  Checkbox,
  Switch,
}
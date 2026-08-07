import { cn } from "@/lib/utils"

type BaseProps = {
    className? : string
}

const Base = ({children, className, ...props}: React.PropsWithChildren<BaseProps>) => {
    return (
        <span className={cn("px-2.5 py-0.5 rounded-sm", className)} {...props}>
            {children}
        </span>
    )
}

const Icon = ({children, className, ...props}: React.PropsWithChildren<BaseProps>) => {
    return (
        <div className={cn("rounded-full w-full h-full flex items-center justify-center aspect-square p-2", className)}>
            {children}
        </div>
    )
}

const Badge = {
    Base,
    Icon
}

export { Badge }
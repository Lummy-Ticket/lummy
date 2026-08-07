import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"

type ModalProps = {
    className? : string
    allowClickOutside?: boolean
    isShow?: boolean
    onToggle?: (isShow: boolean) => void
}

const Modal = ({children, className, isShow, allowClickOutside = false, onToggle,...props}: React.PropsWithChildren<ModalProps>) => {
    const [isModalShow, setIsModalShow] = useState(isShow)

    useEffect(() => {
        setIsModalShow(isShow)
    }, [ isShow ])

    useEffect(() => {
        if(onToggle) {
            onToggle(isModalShow as boolean)
        }
    }, [ isModalShow ])

    if(isModalShow) {
        return (
            <div className="z-[55] fixed top-0 left-0 flex justify-center items-center w-screen h-screen">
                <div onClick={() => allowClickOutside && setIsModalShow(false)} className={cn("fixed z-40 top-0 left-0 w-screen h-screen flex justify-center items-center bg-black/60")}></div>
                <div className="fixed z-50">
                    <div className={cn("bg-white rounded-2xl p-6 sm:p-10 h-fit max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto", className)} {...props}>
                        {children}
                    </div>
                </div>
            </div>
        )
    }

    return null
}

export { Modal }
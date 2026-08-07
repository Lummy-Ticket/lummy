import * as React from "react"
import { cn } from "@/lib/utils"
import Image from "next/image";
import { FaMapMarkerAlt } from "react-icons/fa";
import { Badge } from "./badge";
import Link from "next/link";

export type CategoryT =  "Music" | "Technology" | "Arts" | "Education" | "Sports" | "Food" | "Movies" | "Theater"

type CardEventProps = {
    className?: string,
    image: string,
    date: string,
    title: string,
    location: string,
    category: CategoryT,
    price: number,
    redirect: string,
    soldOut?: boolean,
}

const Event = (({className, image, date, title, location, category, price, redirect, soldOut, ...props}: CardEventProps) => {
    const badgeClass = {
        Music: "bg-secondary-pink-soft text-secondary-pink-dark",
        Technology: "bg-secondary-indigo-soft text-secondary-indigo-dark",
        Arts: "bg-secondary-gold-soft text-secondary-gold-dark",
        Education: "bg-secondary-blue-soft text-lummy-500",
        Sports: "bg-secondary-orange-soft text-secondary-orange-dark",
        Food: "bg-secondary-brown-soft text-secondary-brown-dark",
        Movies: "bg-secondary-purple-soft text-secondary-purple-dark",
        Theater: "bg-secondary-green-soft text-secondary-green-dark"
    }

  return (
        <Link href={redirect} className={cn("border hover:opacity-80 transition ease-in-out flex flex-col justify-between border-primary-navy rounded-3xl pt-2.5 pb-3 px-2.5 gap-2 sm:pb-5 w-full h-fit shrink-0", className)} {...props}>
            <div className="relative w-full aspect-283/207 h-auto">
                <Image alt="event" className={cn("rounded-2xl border border-lummy-500 object-cover", soldOut && "grayscale-[35%]")} src={image} fill />
                {soldOut && (
                    <Badge.Base className="absolute top-2.5 left-2.5 bg-secondary-pink-dark text-white text-sm xl:text-base">Sold Out</Badge.Base>
                )}
                {/* Mobile: category sits on the photo to keep the bottom row to a single price line */}
                <Badge.Base className={cn("sm:hidden absolute top-2.5 right-2.5 text-xs h-fit w-fit text-nowrap", badgeClass[category])}>{category}</Badge.Base>
            </div>
            
            <div className="flex flex-col gap-1 px-0.5 sm:px-2">
                <span className="text-neutral-gray text-sm xl:text-base">{date}</span>

                <h6 className="text-base sm:text-lg xl:text-xl text-neutral-black font-medium truncate">{title}</h6>

                <div className="flex w-full items-center text-primary-navy gap-1 min-w-0">
                    <FaMapMarkerAlt className="shrink-0" />

                    <span className="text-neutral-gray text-sm xl:text-base truncate">{location}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <Badge.Base className={cn("hidden sm:flex text-xs sm:text-sm xl:text-base h-fit w-fit text-nowrap", badgeClass[category])}>{category}</Badge.Base>

                    <span className="text-base sm:text-lg xl:text-xl text-lummy-500 font-medium text-nowrap">IDR {price.toLocaleString("id-ID")}</span>
                </div>
            </div>
        </Link>
  );
});


type CardTicketProps = {
    onClick?: React.MouseEventHandler
    className?: string,
    children: React.ReactNode
    wrapperCircleClass?: string
    circleClass?: string,
    type?: "header" | null
    ref?: React.Ref<HTMLDivElement>
}

const Small = (({className, children, wrapperCircleClass, circleClass, onClick, ref}: CardTicketProps) => {
    return (
        <div ref={ref} onClick={onClick} className={cn("w-fit bg-white flex justify-between border border-lummy-500 rounded-3xl py-5 pl-5 sm:py-7 sm:pl-7", className)}>
            <div className="flex flex-col w-full gap-4 pr-2 min-w-0">
            {children}
            </div>

            <div className={cn("flex flex-col justify-center gap-y-7", wrapperCircleClass)}>
                <div className={cn("z-10 w-3 h-6 -mr-px rounded-l-full border-l border-lummy-500", circleClass)}></div>
                <div className={cn("z-10 w-3 h-6 -mr-px rounded-l-full border-l border-lummy-500", circleClass)}></div>
            </div>
        </div>
    )
})

const Large = (({className, children, type, onClick, ref}: CardTicketProps) => {
    const childrenArray = React.Children.toArray(children);

    return (
        <div ref={ref} onClick={onClick} className={cn('w-full flex flex-col lg:flex-row lg:justify-between gap-5 lg:gap-0 border border-lummy-500 rounded-3xl p-4', className)}>
            {childrenArray[0]}

            <div className="hidden lg:flex flex-col justify-between min-h-full">
                <div className={cn("z-10 bg-white rounded-b-full border border-lummy-500", (type == "header") ? "w-28 h-20 -mt-[17.5px] border-t-white" : "w-16 h-10 -mt-[17.5px] border-t-white")}></div>
                <div className={cn("border-dashed mx-auto h-full border-l-3 border-neutral-light-gray-1")}></div>
                <div className={cn("z-10 bg-white rounded-t-full border border-lummy-500", (type == "header") ? "w-28 h-20 -mb-[17.5px] border-b-white" : "w-16 h-10 -mb-[17.5px] border-b-white")}></div>
            </div>

            {childrenArray[1]}
        </div>
    )
})

type CardBaseProps = {
    className?: string,
    children: React.ReactNode
    onClick?: React.MouseEventHandler
}

const Base = (({className, children, onClick}: CardBaseProps) => {
    return (
        <div onClick={onClick} className={cn('w-fit flex justify-center items-center border border-lummy-500 rounded-3xl p-5', className)}>
            {children}
        </div>
    )
})


const Ticket = {
    Small,
    Large
}

const Card = {
    Event,
    Ticket,
    Base
}

export {Card}
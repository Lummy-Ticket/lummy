"use client";

import * as React from "react"
import { cn } from "@/lib/utils"
import Image from "next/image";
import { MapPin } from "lucide-react";
import { useCategoryLabel, useFormatters, useT } from "@/lib/i18n";
import { Badge } from "./badge";
import Link from "next/link";

export type CategoryT =  "Music" | "Technology" | "Arts" | "Education" | "Sports" | "Food" | "Movies" | "Theater"

// The card sits in a 1/2/3-column grid, so the browser only needs a card-sized file.
const CARD_SIZES = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";

type CardEventProps = {
    className?: string,
    style?: React.CSSProperties,
    image: string,
    date: string,
    title: string,
    location: string,
    category: CategoryT,
    redirect: string,
    soldOut?: boolean,
    /** Cheapest ticket a buyer can pay for right now, in rupiah. 0 or absent means none. */
    fromPrice?: number,
    listingCount?: number,
    // First row of a grid loads right away: it is the largest thing on screen.
    eager?: boolean,
}

const BADGE_CLASS: Record<CategoryT, string> = {
    Music: "bg-secondary-pink-soft text-secondary-pink-dark",
    Technology: "bg-secondary-indigo-soft text-secondary-indigo-dark",
    Arts: "bg-secondary-gold-soft text-secondary-gold-dark",
    Education: "bg-secondary-blue-soft text-lummy-500",
    Sports: "bg-secondary-orange-soft text-secondary-orange-dark",
    Food: "bg-secondary-brown-soft text-secondary-brown-dark",
    Movies: "bg-secondary-purple-soft text-secondary-purple-dark",
    Theater: "bg-secondary-green-soft text-secondary-green-dark",
}

const Event = (({className, image, date, title, location, category, redirect, soldOut, fromPrice, listingCount, eager, ...props}: CardEventProps) => {
    const t = useT();
    const { formatIDR } = useFormatters();
    const categoryLabel = useCategoryLabel();
    const onSale = !soldOut && !!fromPrice;

  return (
        <Link href={redirect} className={cn("group bg-neutral-white border transition duration-300 flex flex-col border-primary-navy rounded-3xl p-2.5 w-full shrink-0 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[4px_4px_0px_#245397] active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0px_#245397] active:duration-100", className)} {...props}>
            <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden border border-lummy-500">
                <Image alt="" className={cn("object-cover transition-transform duration-700 group-hover:scale-[1.05]", soldOut && "grayscale-[35%]")} src={image} sizes={CARD_SIZES} loading={eager ? "eager" : undefined} fill />
                {soldOut && (
                    <Badge.Base className="absolute top-2.5 left-2.5 bg-secondary-pink-dark text-white text-xs font-semibold rounded-full">{t("Sold out", "Habis")}</Badge.Base>
                )}
                {/* Category rides on the photo, top right, with a shadow so it stays legible */}
                <Badge.Base className={cn("absolute top-2.5 right-2.5 text-xs font-medium rounded-full h-fit w-fit text-nowrap shadow-sm", BADGE_CLASS[category])}>{categoryLabel(category)}</Badge.Base>
            </div>

            <div className="flex flex-col gap-1 px-2 pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-primary-navy">{date}</span>
                <h3 className="text-lg text-neutral-black font-semibold leading-snug truncate">{title}</h3>
                <div className="flex w-full items-center gap-1 min-w-0 text-neutral-gray">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-sm truncate">{location}</span>
                </div>
            </div>

            {/* Price stub: the perforation is the same motif the rest of the app uses for money */}
            <div className="mt-3 mx-2 pt-2.5 pb-1 border-t-2 border-dashed border-neutral-light-gray-2 flex items-end justify-between gap-3">
                {onSale ? (
                    <>
                        <div className="min-w-0">
                            <div className="text-[11px] text-neutral-gray leading-none">{t("From", "Mulai")}</div>
                            <div className="font-fredoka font-bold text-lg text-primary-navy leading-tight mt-1">{formatIDR(fromPrice)}</div>
                        </div>
                        {!!listingCount && (
                            <span className="text-xs text-neutral-gray shrink-0 pb-0.5">
                                {listingCount === 1 ? t("1 listing", "1 listing") : t(`${listingCount} listings`, `${listingCount} listing`)}
                            </span>
                        )}
                    </>
                ) : (
                    <span className="text-sm text-neutral-gray py-1.5">{t("No tickets yet, join the waitlist", "Belum ada tiket, masuk waitlist")}</span>
                )}
            </div>
        </Link>
  );
});


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


const Card = {
    Event,
    Base
}

export {Card}
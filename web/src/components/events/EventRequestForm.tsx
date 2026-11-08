"use client";

// A seller asks for a show that is not in the catalogue yet (tasks 11.5). What the ticket read
// fills in what it can; the seller adds the venue and the organiser's official page, which is what
// staff check the categories and prices against before the show goes live. An account's request goes
// to the server; a demo account's stays in this browser and reaches the demo admin's queue.
import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FEATURES } from "@/lib/features";
import { NativeSelect } from "@/components/ui/select-menu";
import { REQUEST_CATEGORIES, REQUEST_COUNTRIES, checkRequest, currencyOf, faceValuesOf, localStart } from "@/lib/events/requests";
import { RequestError, fileEventRequest } from "@/lib/events/requests-client";
import { useCategoryLabel, useT } from "@/lib/i18n";
import { publicSellerName } from "@/lib/listings/rules";
import { useEventRequests, useUser, type Category, type EventRequest } from "@/lib/mock";

export interface RequestPrefill {
  title?: string;
  /** yyyy-mm-dd, as the ticket read gives it. */
  date?: string;
  tier?: string;
  printedPrice?: number;
}

const field = "rounded-xl border border-neutral-light-gray-1 focus:border-lummy-500 px-4 py-3 text-sm text-neutral-black outline-none w-full bg-neutral-white";

export function EventRequestForm({ prefill, onDone }: { prefill?: RequestPrefill; onDone: (r: EventRequest) => void }) {
  const t = useT();
  const categoryLabel = useCategoryLabel();
  const user = useUser((s) => s.user);
  const addSample = useEventRequests((s) => s.add);
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [date, setDate] = useState(prefill?.date ?? "");
  const [time, setTime] = useState("19:00");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("ID");
  const [category, setCategory] = useState<Category>("Music");
  const [link, setLink] = useState("");
  const [tier, setTier] = useState(prefill?.tier ?? "");
  const [price, setPrice] = useState(prefill?.printedPrice ? String(prefill.printedPrice) : "");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usdc = currencyOf(country) === "USDC";

  const submit = async () => {
    const startsAt = localStart(date, time, country);
    const body = { title, startsAt, venue, city, country, category, organizerRef: link, pdfTier: tier, printedPrice: price ? Number(price.replace(/[^\d.]/g, "")) : null, note };
    const checked = checkRequest(body);
    if (!checked.ok) return setError(t(checked.error.en, checked.error.id));
    setError(null);
    setSending(true);
    try {
      let made: EventRequest;
      if (user?.account) {
        made = await fileEventRequest(body);
      } else {
        const v = checked.value;
        addSample({
          submittedBy: publicSellerName(user?.name ?? ""),
          title: v.title, dateISO: v.startsAt, venue: v.venue, city: v.city, country: v.country, currency: currencyOf(v.country),
          category: v.category, faceValues: faceValuesOf(v), pdfTier: v.pdfTier, organizerRef: v.organizerRef, note: v.note || undefined,
          ticketChecked: false, forgeryScore: 0, pdfSuspicious: false,
        });
        made = useEventRequests.getState().requests[0];
      }
      toast.success(
        user?.account
          ? FEATURES.emails
            ? t("Sent. Staff check it against the official page, usually within a day, and email you the result.", "Terkirim. Staf mengeceknya ke halaman resmi, biasanya dalam sehari, lalu mengirim hasilnya lewat email.")
            : t("Sent. Staff check it against the official page, usually within a day.", "Terkirim. Staf mengeceknya ke halaman resmi, biasanya dalam sehari.")
          : t("Sent, in this demo only: the demo admin sees it in the New events queue.", "Terkirim, khusus di demo ini: admin demo melihatnya di antrean Event baru.")
      );
      onDone(made);
    } catch (e) {
      setError(e instanceof RequestError ? e.message : t("It was not sent. Try again.", "Belum terkirim. Coba lagi."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-event-request-form className="flex flex-col gap-4 p-6">
      <p className="text-sm text-neutral-gray leading-relaxed">
        {t(
          "Staff add the show to the catalogue after checking its categories and prices on the organiser's official page, and its terms on resale. You list your ticket once it is approved.",
          "Staf memasukkan acaranya ke katalog setelah mengecek kategori dan harga di halaman resmi penyelenggara, juga S&K-nya soal resale. Tiketmu bisa dijual setelah acaranya disetujui."
        )}
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-neutral-gray">{t("Show name, as the organiser writes it", "Nama acara, seperti tulisan penyelenggara")}</span>
        <input data-req-title value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-gray">{t("Date", "Tanggal")}</span>
          <input data-req-date type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-gray">{t("Start time, local", "Jam mulai, waktu setempat")}</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-gray">{t("Venue", "Tempat")}</span>
          <input data-req-venue value={venue} onChange={(e) => setVenue(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-gray">{t("City", "Kota")}</span>
          <input data-req-city value={city} onChange={(e) => setCity(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-gray">{t("Country", "Negara")}</span>
          <NativeSelect value={country} onChange={(e) => setCountry(e.target.value)}>
            {REQUEST_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{t(c.en, c.id)}</option>)}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-gray">{t("Category", "Kategori")}</span>
          <NativeSelect value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {REQUEST_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </NativeSelect>
        </label>
      </div>
      {usdc && (
        <p className="text-xs text-neutral-gray -mt-1">
          {t("A show abroad is paid in test USDC from the buyer's wallet.", "Acara luar negeri dibayar dengan USDC uji dari wallet pembeli.")}
        </p>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-neutral-gray">{t("Link to the organiser's official page", "Link halaman resmi penyelenggara")}</span>
        <input data-req-link type="url" inputMode="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} className={field} />
        <span className="text-xs text-neutral-gray">{t("Their site, ticketing page or Instagram post with the prices.", "Situsnya, halaman tiketnya, atau postingan Instagram yang memuat harganya.")}</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-gray">{t("Your ticket's category", "Kategori tiketmu")}</span>
          <input value={tier} onChange={(e) => setTier(e.target.value)} placeholder="CAT 1" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-gray">{usdc ? t("Its printed price (US$)", "Harga tercetaknya (US$)") : t("Its printed price (Rp)", "Harga tercetaknya (Rp)")}</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-neutral-gray">{t("Anything staff should know (optional)", "Catatan untuk staf (opsional)")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={field} />
      </label>
      {error && <p data-req-error className="text-sm text-secondary-pink-dark">{error}</p>}
      <Button.Primary data-req-send wrapperClass="w-full" className="w-full" disabled={sending} onClick={() => void submit()}>
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {t("Send the request", "Kirim pengajuan")}
      </Button.Primary>
    </div>
  );
}

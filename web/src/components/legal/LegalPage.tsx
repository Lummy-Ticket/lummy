"use client";

// The privacy policy and the terms, written as plain sections in both languages. Kept as data so
// the two pages read alike and a change to either is a change to text, not to layout.
import { PageContainer } from "@/components/layout/PageContainer";
import { useT } from "@/lib/i18n";

export type Bi = { en: string; id: string };
/** `after`: paragraphs that follow the list, such as what happens to those who break it. */
export type LegalSection = { title: Bi; body?: Bi[]; list?: Bi[]; after?: Bi[] };

/** Who answers for the data and where to write, until there is a company. */
export const CONTROLLER: Bi = {
  en: "The Lummy Ticket team (Zahra Sasongko, Luthfi Hadi and Joanita Timbin Panggalo), the founders running this prototype. There is no company yet; this page will name it once there is.",
  id: "Tim Lummy Ticket (Zahra Sasongko, Luthfi Hadi, dan Joanita Timbin Panggalo), tim pendiri yang menjalankan prototipe ini. Badan usahanya belum ada; halaman ini akan menyebutnya begitu berdiri.",
};
export const CONTACT_EMAIL = "team@lummy.id";

/**
 * A point with its first sentence in bold, so the page can be skimmed by its leads. The lead ends
 * at the first full stop followed by a space, which no amount (Rp25.000) or address (lummy.id) has.
 */
function Lead({ text }: { text: string }) {
  const m = /^(.+?[.!?])\s+(.+)$/.exec(text);
  return (
    <>
      <strong className="font-semibold text-neutral-black">{m ? m[1] : text}</strong>
      {m && ` ${m[2]}`}
    </>
  );
}

export function LegalPage({ title, effective, intro, sections }: { title: Bi; effective: Bi; intro: Bi; sections: LegalSection[] }) {
  const t = useT();
  return (
    <PageContainer width="app">
      <h1 className="lm-in text-3xl md:text-4xl font-bold text-neutral-black tracking-tight">{t(title.en, title.id)}</h1>
      <p className="lm-in text-xs text-neutral-gray mt-2">{t(`In effect from ${effective.en}`, `Berlaku sejak ${effective.id}`)}</p>
      <p className="lm-in text-neutral-gray mt-5 leading-relaxed">{t(intro.en, intro.id)}</p>
      <div className="mt-10 flex flex-col gap-9">
        {sections.map((s, i) => (
          <section key={s.title.en}>
            <h2 className="font-semibold text-xl text-neutral-black">
              <span className="text-primary-navy/40 mr-2">{i + 1}.</span>
              {t(s.title.en, s.title.id)}
            </h2>
            {(s.body ?? []).map((p) => (
              <p key={p.en} className="text-sm text-neutral-gray mt-3 leading-relaxed"><Lead text={t(p.en, p.id)} /></p>
            ))}
            {s.list && (
              <ul className="mt-3 flex flex-col gap-2 list-disc pl-5 text-sm text-neutral-gray leading-relaxed">
                {s.list.map((p) => <li key={p.en}><Lead text={t(p.en, p.id)} /></li>)}
              </ul>
            )}
            {(s.after ?? []).map((p) => (
              <p key={p.en} className="text-sm text-neutral-gray mt-3 leading-relaxed"><Lead text={t(p.en, p.id)} /></p>
            ))}
          </section>
        ))}
      </div>
      <p className="mt-12 text-sm text-neutral-gray">
        {t("Questions or requests: ", "Pertanyaan atau permintaan: ")}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary-navy font-medium">{CONTACT_EMAIL}</a>
      </p>
    </PageContainer>
  );
}

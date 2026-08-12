// Blob pastel dekoratif ala Lummy — bikin hero terasa "didesain", bukan template.
// Parent WAJIB relative + overflow-hidden. Cuma tampil di layar besar (dekorasi).
export function HeroBlobs() {
  return (
    <div className="hidden lg:block absolute inset-0 z-0 pointer-events-none" aria-hidden>
      <div className="absolute -left-40 top-10 w-[420px] h-[420px] rounded-full bg-secondary-blue-light" />
      <div className="absolute right-[-60px] bottom-[-40px] w-64 h-64 rounded-full bg-secondary-cream-light" />
      <div className="absolute right-40 top-16 w-16 h-16 rounded-full bg-secondary-pink-light" />
      <div className="absolute left-1/2 bottom-6 w-10 h-10 rounded-full bg-pastel-yellow" />
    </div>
  );
}

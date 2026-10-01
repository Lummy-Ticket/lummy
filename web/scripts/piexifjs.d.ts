// piexifjs ships no types. Only what the evidence check uses to write a camera's EXIF into a JPEG.
declare module "piexifjs" {
  const piexif: {
    dump(exif: Record<string, Record<number, unknown>>): string;
    insert(exif: string, jpeg: string): string;
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
  };
  export default piexif;
}

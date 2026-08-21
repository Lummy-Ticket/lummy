import LoadingScreen from "@/components/ui/LoadingScreen";

// App Router fallback for route transitions, so a slow navigation shows the
// brand instead of leaving the previous page sitting there looking frozen.
export default function Loading() {
  return <LoadingScreen />;
}

import { lazy, Suspense } from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";

// Lazy client island — keeps Three.js out of the SSR graph
const SpecimenApp = lazy(() =>
  import("@/components/plants/SpecimenApp").then((m) => ({
    default: m.SpecimenApp,
  })),
);

export const Route = createFileRoute("/")({
  component: HomePage,
});

function PaperSplash() {
  return (
    <div
      className="flex h-dvh w-full items-center justify-center"
      style={{ background: "#f7f6f3" }}
    />
  );
}

function HomePage() {
  return (
    <ClientOnly fallback={<PaperSplash />}>
      <Suspense fallback={<PaperSplash />}>
        <SpecimenApp />
      </Suspense>
    </ClientOnly>
  );
}

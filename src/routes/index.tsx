import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { SpecimenApp } from "@/components/plants/SpecimenApp";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <ClientOnly fallback={<PaperSplash />}>
      <SpecimenApp />
    </ClientOnly>
  );
}

function PaperSplash() {
  return (
    <div
      className="flex h-dvh w-full items-center justify-center"
      style={{ background: "#f7f6f3" }}
    />
  );
}

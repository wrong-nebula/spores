import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SPECIMENS, formatSpecimenId } from "@/lib/plants/catalog";
import { PlantScene } from "./PlantScene";

const PAPER = "#f7f6f3";

/** SF Symbols–style sun.min (small sun) */
function IconSunMin({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3.5v1.6M12 18.9v1.6M3.5 12h1.6M18.9 12h1.6M6.05 6.05l1.13 1.13M16.82 16.82l1.13 1.13M6.05 17.95l1.13-1.13M16.82 7.18l1.13-1.13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** SF Symbols–style moon */
function IconMoon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M20.2 14.35A7.75 7.75 0 0 1 9.65 3.8 7.9 7.9 0 1 0 20.2 14.35Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SpecimenApp() {
  const [index, setIndex] = useState(0);
  const [night, setNight] = useState(false);
  const specimen = SPECIMENS[index]!;

  const go = useCallback((dir: -1 | 1) => {
    setIndex((i) => (i + dir + SPECIMENS.length) % SPECIMENS.length);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("night", night);
    document.body.classList.toggle("night", night);
    if (!night) {
      document.body.style.setProperty("--paper-bg", PAPER);
    } else {
      document.body.style.setProperty("--paper-bg", "#000000");
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", night ? "#000000" : PAPER);
    return () => {
      document.documentElement.classList.remove("night");
      document.body.classList.remove("night");
    };
  }, [night]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A" || e.key === "h") {
        e.preventDefault();
        go(-1);
      } else if (
        e.key === "ArrowRight" ||
        e.key === "d" ||
        e.key === "D" ||
        e.key === "l"
      ) {
        e.preventDefault();
        go(1);
      } else if (e.key === "Home") {
        e.preventDefault();
        setIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setIndex(SPECIMENS.length - 1);
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNight((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div
      className={`relative h-dvh w-full overflow-hidden ${night ? "night" : ""}`}
      style={{ background: night ? "#000000" : "var(--paper-bg, #f7f6f3)" }}
    >
      <PlantScene specimen={specimen} night={night} />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="pointer-events-auto">
          <button
            type="button"
            aria-label={night ? "Switch to day mode" : "Switch to night mode"}
            aria-pressed={night}
            onClick={() => setNight((v) => !v)}
            className="theme-toggle group flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-ink)] transition-colors duration-300"
          >
            <span className="opacity-45 transition-opacity duration-200 group-hover:opacity-90 group-focus-visible:opacity-90">
              {night ? <IconSunMin /> : <IconMoon />}
            </span>
          </button>
        </div>
        <div className="specimen-label text-right">
          <p className="text-[11px] font-medium tabular-nums tracking-wide text-[color:var(--color-ink-muted)]">
            <span className="text-[color:var(--color-ink)]">
              {formatSpecimenId(specimen.id)}
            </span>
            <span className="mx-1.5 text-[color:var(--color-ink-faint)]">/</span>
            <span>80</span>
          </p>
        </div>
      </header>

      <button
        type="button"
        aria-label="Previous specimen"
        onClick={() => go(-1)}
        className="nav-edge group absolute left-0 top-1/2 z-20 flex h-28 w-11 -translate-y-1/2 items-center justify-center sm:w-14 md:w-16"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--color-ink)] opacity-25 transition-opacity duration-200 group-hover:opacity-65 group-focus-visible:opacity-80 sm:h-12 sm:w-12">
          <ChevronLeft className="h-7 w-7" strokeWidth={1.15} />
        </span>
      </button>
      <button
        type="button"
        aria-label="Next specimen"
        onClick={() => go(1)}
        className="nav-edge group absolute right-0 top-1/2 z-20 flex h-28 w-11 -translate-y-1/2 items-center justify-center sm:w-14 md:w-16"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--color-ink)] opacity-25 transition-opacity duration-200 group-hover:opacity-65 group-focus-visible:opacity-80 sm:h-12 sm:w-12">
          <ChevronRight className="h-7 w-7" strokeWidth={1.15} />
        </span>
      </button>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-7">
        <div key={specimen.id} className="specimen-label text-center">
          <p className="specimen-latin text-[13px] italic tracking-wide text-[color:var(--color-ink-muted)] sm:text-sm">
            {specimen.name}
          </p>
        </div>
      </footer>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { RiPaletteLine, RiCheckLine } from "@remixicon/react";
import { themes, applyTheme } from "@/lib/themes";

export default function ThemeToggle() {
  const [theme, setThemeState] = useState<string>("");

  // keeps popover mounted picker in sync when switching via keyboard shortcut elsewhere
  useEffect(() => {
    const sync = () => setThemeState(document.documentElement.dataset.theme ?? "");
    sync();
    window.addEventListener("astro:after-swap", sync);
    return () => window.removeEventListener("astro:after-swap", sync);
  }, []);

  const pick = (id: string) => {
    const t = themes.find((x) => x.id === id)!;
    setThemeState(id);
    applyTheme(t);
    localStorage.setItem("theme", id);
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="icon-xs" aria-label="theme picker" className="cursor-pointer">
            <RiPaletteLine />
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={8} className="w-44 gap-0.5 p-1.5">
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={() => pick(t.id)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
          >
            <span
              className="size-3.5 shrink-0 rounded-full border border-foreground/20"
              style={{ background: t.dot[0] }}
              aria-hidden
            />
            <span className="flex-1">{t.label}</span>
            {theme === t.id && <RiCheckLine className="size-3.5 text-foreground" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

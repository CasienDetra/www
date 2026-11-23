"use client";

import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { themes, applyTheme } from "@/lib/themes";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  // stays in sync with theme changes made outside this button (e.g. after view transitions)
  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains("dark"));
    sync();
    window.addEventListener("astro:after-swap", sync);
    return () => window.removeEventListener("astro:after-swap", sync);
  }, []);

  const toggle = () => {
    const next = themes.find((t) => t.dark === !dark)!;
    applyTheme(next);
    localStorage.setItem("theme", next.id);
    setDark(next.dark);
  };

  return (
    <Button
      variant="outline"
      size="icon-xs"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="cursor-pointer"
      onClick={toggle}
    >
      {dark ? <RiSunLine /> : <RiMoonLine />}
    </Button>
  );
}

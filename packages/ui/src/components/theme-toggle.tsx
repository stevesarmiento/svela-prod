"use client";

import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { IconMoonStarsFill, IconSunMaxFill } from "symbols-react";

import { Button } from "./button";

export function ModeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="relative cursor-pointer border-0 border-transparent outline-transparent ring-0 ring-transparent focus:border-transparent focus:outline-transparent focus:ring-transparent active:scale-[0.98] active:border-0 active:border-transparent active:outline-0 active:ring-0 active:ring-transparent"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {resolvedTheme === "light" ? (
          <motion.div
            key="sun"
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 90 }}
            transition={{ duration: 0.2 }}
          >
            <IconSunMaxFill className="h-[1.2rem] w-[1.2rem] fill-primary-900" />
          </motion.div>
        ) : (
          <motion.div
            key="moon"
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 90 }}
            transition={{ duration: 0.2 }}
          >
            <IconMoonStarsFill className="h-[1.2rem] w-[1.2rem] fill-primary-200" />
          </motion.div>
        )}
      </AnimatePresence>
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

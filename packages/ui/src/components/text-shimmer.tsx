"use client";
import { type Transition, motion } from "motion/react";
import type { JSX } from "react";
import { cn } from "../utils";

export type TextShimmerWaveProps = {
  children: string;
  as?: React.ElementType;
  className?: string;
  duration?: number;
  zDistance?: number;
  xDistance?: number;
  yDistance?: number;
  spread?: number;
  scaleDistance?: number;
  rotateYDistance?: number;
  transition?: Transition;
};

export function TextShimmerWave({
  children,
  as: Component = "p",
  className,
  duration = 1,
  zDistance = 10,
  xDistance = 2,
  yDistance = -2,
  spread = 1,
  scaleDistance = 1.1,
  rotateYDistance = 10,
  transition,
}: TextShimmerWaveProps) {
  const MotionComponent = motion.create(
    Component as keyof JSX.IntrinsicElements,
  );

  return (
    <MotionComponent
      className={cn(
        "relative inline-block [perspective:500px]",
        "[--base-color:oklch(0.7118_0.0129_286.07)] [--base-gradient-color:oklch(0_0_0)]",
        "dark:[--base-color:oklch(0.5517_0.0138_285.94)] dark:[--base-gradient-color:oklch(1_0_0)]",
        className,
      )}
      style={{ color: "var(--base-color)" }}
    >
      {children.split("").map((char, i) => {
        const delay = (i * duration * (1 / spread)) / children.length;
        const charKey = `${i}-${char}`;

        return (
          <motion.span
            key={charKey}
            className={cn(
              "inline-block whitespace-pre [transform-style:preserve-3d]",
            )}
            initial={{
              z: 0,
              scale: 1,
              rotateY: 0,
              color: "var(--base-color)",
            }}
            animate={{
              z: [0, zDistance, 0],
              x: [0, xDistance, 0],
              y: [0, yDistance, 0],
              scale: [1, scaleDistance, 1],
              rotateY: [0, rotateYDistance, 0],
              color: [
                "var(--base-color)",
                "var(--base-gradient-color)",
                "var(--base-color)",
              ],
            }}
            transition={{
              duration: duration,
              repeat: Number.POSITIVE_INFINITY,
              repeatDelay: (children.length * 0.05) / spread,
              delay,
              ease: "easeInOut",
              ...transition,
            }}
          >
            {char}
          </motion.span>
        );
      })}
    </MotionComponent>
  );
}

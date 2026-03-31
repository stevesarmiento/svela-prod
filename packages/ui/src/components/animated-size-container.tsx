import { type HTMLMotionProps, motion } from "motion/react";

import {
  type ComponentType,
  type PropsWithChildren,
  forwardRef,
  useRef,
} from "react";
import { useResizeObserver } from "../hooks";
import { cn } from "../utils";

type AnimatedSizeContainerProps = PropsWithChildren<{
  width?: boolean;
  height?: boolean;
}> &
  Omit<HTMLMotionProps<"div">, "animate" | "children">;

const MotionDiv = motion.div as ComponentType<HTMLMotionProps<"div">>;

/**
 * A container with animated width and height (each optional) based on children dimensions
 */
const AnimatedSizeContainer = forwardRef<
  HTMLDivElement,
  AnimatedSizeContainerProps
>(
  (
    {
      width = false,
      height = false,
      className,
      transition,
      children,
      ...rest
    }: AnimatedSizeContainerProps,
    forwardedRef,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const resizeObserverEntry = useResizeObserver(containerRef);

    return (
      <MotionDiv
        ref={forwardedRef}
        className={cn("overflow-hidden", className)}
        animate={{
          width: width
            ? resizeObserverEntry?.contentRect?.width ?? "auto"
            : "auto",
          height: height
            ? resizeObserverEntry?.contentRect?.height ?? "auto"
            : "auto",
        }}
        transition={transition ?? { type: "spring", duration: 0.3 }}
        {...rest}
      >
        <div
          ref={containerRef}
          className={cn(height && "h-max", width && "w-max")}
        >
          {children}
        </div>
      </MotionDiv>
    );
  },
);

AnimatedSizeContainer.displayName = "AnimatedSizeContainer";

export { AnimatedSizeContainer };

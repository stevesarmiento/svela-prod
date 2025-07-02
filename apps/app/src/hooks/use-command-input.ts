"use client";

import { useRef, useEffect } from 'react';

export function useCommandInput(isOpen: boolean) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when command opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  return { inputRef };
}
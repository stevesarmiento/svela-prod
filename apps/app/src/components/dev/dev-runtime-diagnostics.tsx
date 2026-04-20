"use client";

import type React from "react";
import { ReactScan } from "./react-scan";
import {
  RuntimeErrorBoundary,
  RuntimeErrorCapture,
} from "./runtime-error-capture";

export function DevRuntimeDiagnostics(props: { children: React.ReactNode }) {
  return (
    <>
      <ReactScan />
      <RuntimeErrorCapture />
      <RuntimeErrorBoundary>{props.children}</RuntimeErrorBoundary>
    </>
  );
}

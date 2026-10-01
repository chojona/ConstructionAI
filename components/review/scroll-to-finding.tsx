"use client";

import { useEffect } from "react";

export function ScrollToFinding() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id.startsWith("finding-")) return;
    document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, []);
  return null;
}

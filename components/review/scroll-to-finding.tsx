"use client";

import { useEffect } from "react";

export function ScrollToFinding() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id.startsWith("finding-")) return;
    const node = document.getElementById(id);
    if (!node) return;
    const details = node.closest("details");
    if (details instanceof HTMLDetailsElement) details.open = true;
    node.scrollIntoView({ block: "center" });
  }, []);
  return null;
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  // Page preview reads pdf.js standard-14 font files from disk. The tracer
  // does not follow that directory unless it is listed here.
  outputFileTracingIncludes: {
    "/api/projects/[projectId]/revisions/[revisionId]/pages/[pageNumber]": [
      "./node_modules/pdfjs-dist/package.json",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
    ],
  },
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;

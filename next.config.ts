import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 uses Turbopack by default — it has native WASM support,
  // so no custom webpack rules are needed for @huggingface/transformers.
  // An empty turbopack config tells Next.js we've acknowledged the switch.
  turbopack: {},

  // Don't try to bundle @huggingface/transformers on the server —
  // it uses browser-only APIs (FileReader, WebAssembly, etc.)
  serverExternalPackages: ["@huggingface/transformers"],
};

export default nextConfig;

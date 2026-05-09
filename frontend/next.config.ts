import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// `__dirname` is undefined when Next 16 loads this config as ESM, so derive
// the directory from import.meta.url and fall back to process.cwd().
const here = (() => {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
})();

const nextConfig: NextConfig = {
  // Pin the Turbopack root to this folder so it doesn't walk up to the
  // monorepo root (which has no package.json) and fail to resolve
  // tailwindcss / other deps installed under frontend/node_modules.
  turbopack: {
    root: here,
  },
};

export default nextConfig;

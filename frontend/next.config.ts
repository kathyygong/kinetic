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
  //
  // On Vercel the build already runs from this folder AND Vercel sets
  // `outputFileTracingRoot` to /vercel/path0 \u2014 forcing `turbopack.root` here
  // produces a "values must match" warning. Skip the override there; the
  // build still finds the right root via Vercel's own config.
  ...(process.env.VERCEL
    ? {}
    : {
        turbopack: {
          root: here,
        },
      }),
};

export default nextConfig;

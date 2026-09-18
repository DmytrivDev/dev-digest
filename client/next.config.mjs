import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * Let webpack resolve the vendored `@devdigest/shared` sources.
   *
   * That package is written in ESM style — `export * from './contracts/findings.js'`
   * — but ships as TypeScript, so the `.js` specifiers have no `.js` file behind
   * them. Every client import from it used to be `import type`, which the
   * compiler erases, so nothing ever asked webpack to resolve the barrel at
   * runtime. The first VALUE import (a shared field-length constant) did, and
   * the dev server died with "Can't resolve './contracts/findings.js'" — while
   * `tsc` and vitest both stayed green, because TypeScript maps the extension
   * itself and Vite already applies this alias.
   *
   * `.js` stays last in each list so genuine JavaScript still resolves.
   */
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
};

export default withNextIntl(nextConfig);

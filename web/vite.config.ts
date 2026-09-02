import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const githubRepositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1);
const inferredPagesBase =
  process.env.GITHUB_PAGES === "true" && githubRepositoryName
    ? `/${githubRepositoryName}/`
    : "/";
const base = process.env.VITE_BASE_PATH ?? inferredPagesBase;
const normalizedBase = base.endsWith("/") ? base : `${base}/`;

export default defineConfig({
  base: normalizedBase,
  define: {
    CESIUM_BASE_URL: JSON.stringify(`${normalizedBase}cesium`),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "node_modules/cesium/Build/Cesium/Workers", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/ThirdParty", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/Assets", dest: "cesium" },
        { src: "node_modules/cesium/Build/Cesium/Widgets", dest: "cesium" },
      ],
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": process.env.VITE_API_PROXY ?? "http://127.0.0.1:8000" },
  },
});

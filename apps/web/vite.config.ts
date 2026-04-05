import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ command }) => {
  const projectRoot = path.resolve(__dirname, ".");
  const nheEngaPylibs = path.resolve(__dirname, "../../../nhe-enga/gramatica/pylibs");
  const devWheelBase = command === "serve" ? `/@fs${nheEngaPylibs}` : "";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    define: devWheelBase
      ? {
          __PYCATE_DEV_WHEEL_BASE__: JSON.stringify(devWheelBase),
        }
      : {},
    server: command === "serve"
      ? {
          fs: {
            allow: [projectRoot, nheEngaPylibs],
          },
        }
      : undefined,
    test: {
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
      globals: true,
      include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    },
  };
});

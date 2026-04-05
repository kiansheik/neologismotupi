import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const EXPR = 'pûera * (rama * (pyra * Verb("erokûab")))';
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

test.describe("pyodide parity", () => {
  test.setTimeout(120_000);

  test("classifier stacking matches local pydicate", async ({ page }) => {
    const localInfo = runLocalPythonDiagnostics();

    const wheelBase = `/@fs${path.resolve(CURRENT_DIR, "../../../../../nhe-enga/gramatica/pylibs")}`;
    const iframeUrl = `/etymology/iframe_pyodide.html?wheelBase=${encodeURIComponent(wheelBase)}&cb=${Date.now()}`;

    await page.goto(iframeUrl);
    await page.waitForFunction(() => {
      return (window as any).pyodideReady === true || Boolean((window as any).pyodideError);
    }, null, { timeout: 180_000 });

    const iframeError = await page.evaluate(() => (window as any).pyodideError || "");
    if (iframeError) {
      throw new Error(`Pyodide init failed: ${iframeError}`);
    }

    const output = await page.evaluate(async (expr) => {
      return await new Promise<string>((resolve, reject) => {
        const hash = `test-${Date.now()}`;
        const orderid = 0;
        const handler = (event: MessageEvent) => {
          if (!event.data || event.data.command !== "processBlockResponse") return;
          if (event.data.hash !== hash) return;
          window.removeEventListener("message", handler);
          resolve(String(event.data.resp_html || ""));
        };
        window.addEventListener("message", handler);
        window.postMessage(
          {
            command: "processBlock",
            orderid,
            html: `<pre>${expr}</pre>`,
            hash,
          },
          "*",
        );
        window.setTimeout(() => {
          window.removeEventListener("message", handler);
          reject(new Error("Pyodide response timeout"));
        }, 60_000);
      });
    }, buildDiagnosticsScript(EXPR));

    const lines = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const pyodideVersion = stripQuotes(lines[0] ?? "");
    const pyodideHash = stripQuotes(lines[1] ?? "");
    const pyodideResult = stripQuotes(lines[2] ?? "");

    expect(pyodideVersion).toBe(localInfo.version);
    expect(pyodideHash).toBe(localInfo.hash);
    expect(pyodideResult).toBe(localInfo.result);
  });
});

function runLocalPythonDiagnostics(): { version: string; hash: string; result: string } {
  const pydicatePath = path.resolve(CURRENT_DIR, "../../../../../nhe-enga/pydicate");
  const tupiPath = path.resolve(CURRENT_DIR, "../../../../../nhe-enga/tupi");
  const script = [
    "# -*- coding: utf-8 -*-",
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(pydicatePath)})`,
    `sys.path.insert(0, ${JSON.stringify(tupiPath)})`,
    "from pydicate.lang.tupilang.pos import *",
    "import importlib.metadata as m",
    "import hashlib, pathlib",
    "import pydicate.lang.tupilang.pos.deverbal as dv",
    "print(m.version('pydicate'))",
    "print(hashlib.sha256(pathlib.Path(dv.__file__).read_bytes()).hexdigest())",
    `expr = ${EXPR}`,
    "print(expr.eval())",
  ].join("\n");

  const output = execFileSync("python", ["-c", script], {
    encoding: "utf8",
  }).trim();
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    version: lines[0] ?? "",
    hash: lines[1] ?? "",
    result: lines[2] ?? "",
  };
}

function stripQuotes(value: string): string {
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}

function buildDiagnosticsScript(expression: string): string {
  return [
    "import importlib.metadata as m",
    "import hashlib, pathlib",
    "import pydicate.lang.tupilang.pos.deverbal as dv",
    "m.version('pydicate')",
    "hashlib.sha256(pathlib.Path(dv.__file__).read_bytes()).hexdigest()",
    `expr = ${expression}`,
    "expr.eval()",
  ].join("\n");
}

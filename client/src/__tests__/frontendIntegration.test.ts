import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Frontend API Integration (Phase 10)", () => {
  const srcPath = path.resolve(__dirname, "../../src");

  // Read the contents of all relevant frontend files to check for hard-coded paths
  const readFileContents = (dir: string): string[] => {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        if (!file.includes("__tests__")) {
          results = results.concat(readFileContents(filePath));
        }
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        results.push(fs.readFileSync(filePath, 'utf-8'));
      }
    });
    return results;
  };

  const files = readFileContents(srcPath);
  const entireSrc = files.join("\n");

  it("should not contain localhost or 127.0.0.1 hardcoded API URLs", () => {
    expect(entireSrc).not.toMatch(/http:\/\/localhost/);
    expect(entireSrc).not.toMatch(/http:\/\/127\.0\.0\.1/);
  });

  it("should not contain production vercel hardcoded API URLs", () => {
    expect(entireSrc).not.toMatch(/https:\/\/.*\.vercel\.app/);
  });

  it("should consume the correct same-origin /api/status endpoint", () => {
    expect(entireSrc).toContain('fetch("/api/status")');
  });

  it("should consume the correct same-origin /api/incidents endpoint", () => {
    expect(entireSrc).toContain('fetch(`/api/incidents/');
  });

  it("Provider data dependency is explicitly validated as not fetching /api/providers", () => {
    expect(entireSrc).not.toContain('/api/providers');
  });

  it("API errors are handled without pretending success in fetch", () => {
    // Asserting the presence of error checking in the UI fetches
    expect(entireSrc).toMatch(/if \(!res\.ok\)/);
  });
});

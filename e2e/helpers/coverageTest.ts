import { test as base } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import v8toIstanbul from 'v8-to-istanbul';

const COVERAGE_ENABLED = process.env.PW_COVERAGE === '1';
const NYC_DIR = path.join(process.cwd(), '.nyc_output');

function toLocalSourcePath(url: string): string | null {
  const normalizedUrl = url.split('?')[0].split('#')[0];
  const appBaseUrls = ['http://127.0.0.1:4200/', 'http://localhost:4200/'];
  const baseUrl = appBaseUrls.find((base) => normalizedUrl.startsWith(base));

  if (!baseUrl) {
    return null;
  }

  const relativePath = normalizedUrl.replace(baseUrl, '');
  if (!relativePath.startsWith('src/')) {
    return null;
  }

  return path.join(process.cwd(), decodeURIComponent(relativePath));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function mergeCoverage(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  for (const [filePath, current] of Object.entries(source)) {
    const existing = target[filePath];

    if (!existing) {
      target[filePath] = current;
      continue;
    }

    for (const [key, count] of Object.entries(current.s ?? {})) {
      existing.s[key] = (existing.s[key] ?? 0) + Number(count);
    }

    for (const [key, count] of Object.entries(current.f ?? {})) {
      existing.f[key] = (existing.f[key] ?? 0) + Number(count);
    }

    for (const [key, branchCounts] of Object.entries(current.b ?? {})) {
      const currentBranch = Array.isArray(branchCounts) ? branchCounts : [];
      const existingBranch = Array.isArray(existing.b[key]) ? existing.b[key] : [];
      existing.b[key] = currentBranch.map((value, index) => (existingBranch[index] ?? 0) + Number(value));
    }
  }

  return target;
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (COVERAGE_ENABLED) {
      await fs.mkdir(NYC_DIR, { recursive: true });
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    }

    await use(page);

    if (COVERAGE_ENABLED) {
      const entries = await page.coverage.stopJSCoverage();
      let istanbulCoverage: Record<string, any> = {};

      for (const entry of entries) {
        const sourcePath = toLocalSourcePath(entry.url);
        if (!sourcePath) {
          continue;
        }

        const exists = await fileExists(sourcePath);
        if (!exists) {
          continue;
        }

        const converter = entry.source
          ? v8toIstanbul(sourcePath, 0, { source: entry.source })
          : v8toIstanbul(sourcePath);
        await converter.load();
        converter.applyCoverage(entry.functions);
        istanbulCoverage = mergeCoverage(istanbulCoverage, converter.toIstanbul());
      }

      const fileName = `${Date.now()}-${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.retry}-${testInfo.testId}.json`;
      const filePath = path.join(NYC_DIR, fileName.replace(/[<>:"/\\|?*]+/g, '_'));
      await fs.writeFile(filePath, JSON.stringify(istanbulCoverage), 'utf-8');
    }
  },
});

export { expect } from '@playwright/test';

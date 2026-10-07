import { test as base } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import v8toIstanbul from 'v8-to-istanbul';
import libCoverage from 'istanbul-lib-coverage';
import { mockProtocolViolations } from './websocketMock';

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

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (COVERAGE_ENABLED) {
      await fs.mkdir(NYC_DIR, { recursive: true });
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    }

    await use(page);

    // What the WebSocket mock and the app sent each other must match
    // protocol/schema.json, like the real server's messages in the Go tests
    const violations = mockProtocolViolations(page);
    if (violations.length > 0) {
      throw new Error(`The WebSocket mock left protocol/schema.json:\n${violations.join('\n')}`);
    }

    if (COVERAGE_ENABLED) {
      const entries = await page.coverage.stopJSCoverage();
      // Merged by source location: a module loaded twice can come with
      // different statement and branch maps
      const coverageMap = libCoverage.createCoverageMap({});

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
        coverageMap.merge(converter.toIstanbul());
      }

      const fileName = `${Date.now()}-${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.retry}-${testInfo.testId}.json`;
      const filePath = path.join(NYC_DIR, fileName.replace(/[<>:"/\\|?*]+/g, '_'));
      await fs.writeFile(filePath, JSON.stringify(coverageMap.toJSON()), 'utf-8');
    }
  },
});

export { expect } from '@playwright/test';

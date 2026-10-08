// Builds the app twice for the update test: the version installed on the
// CCU and the new one the update brings (e2e-update/update.spec.ts)
import { execSync } from 'node:child_process';

for (const [dir, version] of [
  ['installed', '1.0.0'],
  ['new', '1.0.1'],
]) {
  execSync(`npx vite build --outDir e2e-update/.fixture/${dir} --emptyOutDir`, {
    stdio: 'inherit',
    env: { ...process.env, MUI_APP_VERSION: version },
  });
}

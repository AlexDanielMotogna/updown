#!/usr/bin/env node
/**
 * Points git at .githooks/ so the pre-commit secret scan runs for everyone who
 * installs dependencies. Wired to the root `prepare` script.
 *
 * Deliberately never fails: it runs inside Docker builds and CI checkouts where
 * there is no .git directory, and a hook-setup step must not be able to break a
 * deploy.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

try {
  if (!existsSync('.git')) process.exit(0); // worktree, submodule, Docker build
  const current = (() => {
    try {
      return execFileSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  })();
  if (current === '.githooks') process.exit(0);
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  console.log('[hooks] core.hooksPath -> .githooks (pre-commit secret scan enabled)');
} catch {
  console.warn('[hooks] could not set core.hooksPath; the pre-commit secret scan is NOT active');
}

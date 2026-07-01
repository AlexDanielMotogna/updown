// Build identity used to force stale clients onto the latest deploy.
//
// BUILD_ID is baked at build time from the git commit SHA (Railway sets
// RAILWAY_GIT_COMMIT_SHA; mapped to NEXT_PUBLIC_BUILD_ID in next.config.js). The
// running client compares its baked BUILD_ID against the server's /api/version;
// a mismatch means a newer deploy is live → the VersionGate hard-reloads to pull
// the new bundle. Falls back to 'dev' locally (gate is inert when 'dev').
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

// Bump this MANUALLY only when a deploy is INCOMPATIBLE with old client state and
// we must wipe caches + localStorage + sessionStorage + IndexedDB + the Privy
// session (this logs users out). Most deploys do NOT need it — the build-id
// reload above is enough. Increment ONLY for a breaking change.
export const BREAKING_VERSION = '1';

import pkg from '../../package.json';
import buildVersion from '../app-version.json';

// What version of the app is actually running. Same scheme as azattechpoker
// (see its src/lib/buildInfo.ts and docs/VERSIONING.md): the source of truth
// is src/app-version.json, not package.json's `version`, and NEVER edit
// either by hand (bots or humans). After every merge to main,
// .github/workflows/version.yml bumps both, commits "chore(release): vX.Y.Z"
// and tags it.
export const APP_VERSION: string = buildVersion.version || pkg.version || '0.0.0-undefined';

// Short commit SHA of this build (Vercel's VERCEL_GIT_COMMIT_SHA via a Vite
// define). Guarded so a build that lacks the define just shows nothing.
declare const __GIT_SHA__: string | undefined;
export const GIT_SHA: string = typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : '';

import * as _ from 'lodash';
import { Observable } from 'rxjs';
import {
  getLibBLodashVersion,
  getLibBRxjsIdentity,
  libBGreeting,
  LIB_B_INFO,
} from '@myorg/lib-b';

// We'll use the Observable constructor's identity to verify peer dep sharing
const rxjsIdentity = Observable.toString();

// Re-export lib-b for convenience
export { getLibBLodashVersion, getLibBRxjsIdentity, libBGreeting, LIB_B_INFO };

/**
 * Returns the lodash version used by lib-a.
 * Expected: 4.17.21
 */
export function getLibALodashVersion(): string {
  return _.VERSION;
}

/**
 * Returns a unique identifier for the rxjs Observable class.
 * If peer dependencies work correctly, all libs should return the same value.
 */
export function getLibARxjsIdentity(): string {
  return rxjsIdentity;
}

/**
 * A simple utility function to demonstrate lib-a functionality.
 * Uses lodash to ensure the import is real, not tree-shaken.
 */
export function libAGreeting(name: string): string {
  return _.capitalize(`hello from lib-a, ${name}!`);
}

/**
 * Metadata about this library for debugging.
 */
export const LIB_A_INFO = {
  name: '@myorg/lib-a',
  lodashVersion: _.VERSION,
  expectedLodashVersion: '4.17.21',
  isVersionCorrect: _.VERSION === '4.17.21',
} as const;

/**
 * Comprehensive version report for debugging.
 * This function collects version info from both lib-a and lib-b.
 */
export interface VersionReport {
  libA: {
    lodashVersion: string;
    expectedLodashVersion: string;
    isCorrect: boolean;
  };
  libB: {
    lodashVersion: string;
    expectedLodashVersion: string;
    isCorrect: boolean;
  };
  peerDependencyCheck: {
    rxjsShared: boolean;
  };
}

export function getVersionReport(): VersionReport {
  const libARxjs = getLibARxjsIdentity();
  const libBRxjs = getLibBRxjsIdentity();

  return {
    libA: {
      lodashVersion: getLibALodashVersion(),
      expectedLodashVersion: '4.17.21',
      isCorrect: getLibALodashVersion() === '4.17.21',
    },
    libB: {
      lodashVersion: getLibBLodashVersion(),
      expectedLodashVersion: '4.17.15',
      isCorrect: getLibBLodashVersion() === '4.17.15',
    },
    peerDependencyCheck: {
      rxjsShared: libARxjs === libBRxjs,
    },
  };
}

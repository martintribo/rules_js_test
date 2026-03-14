import * as _ from 'lodash';
import { Observable } from 'rxjs';
import {
  getLibBLodashVersion,
  getLibBRxjsIdentity,
  libBGreeting,
} from '@myorg/lib-b';

// We'll use the Observable constructor's identity to verify peer dep sharing
const rxjsIdentity = Observable.toString();

// Re-export lib-b for convenience
export { getLibBLodashVersion, getLibBRxjsIdentity, libBGreeting };

/**
 * Returns the lodash version used by lib-c.
 * Expected: 4.17.19
 */
export function getLibCLodashVersion(): string {
  return _.VERSION;
}

/**
 * Returns a unique identifier for the rxjs Observable class.
 * If peer dependencies work correctly, all libs should return the same value.
 */
export function getLibCRxjsIdentity(): string {
  return rxjsIdentity;
}

/**
 * A simple utility function to demonstrate lib-c functionality.
 * Uses lodash to ensure the import is real, not tree-shaken.
 */
export function libCGreeting(name: string): string {
  return _.capitalize(`hello from lib-c, ${name}!`);
}

/**
 * Metadata about this library for debugging.
 */
export const LIB_C_INFO = {
  name: '@myorg/lib-c',
  lodashVersion: _.VERSION,
  expectedLodashVersion: '4.17.19',
  isVersionCorrect: _.VERSION === '4.17.19',
  // lib-c uses lib-b via SYMLINK (not injected)
  libBAccessMethod: 'symlink',
} as const;

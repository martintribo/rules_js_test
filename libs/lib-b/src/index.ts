import * as _ from 'lodash';
import { Observable } from 'rxjs';

// We'll use the Observable constructor's identity to verify peer dep sharing
const rxjsIdentity = Observable.toString();

/**
 * Returns the lodash version used by lib-b.
 * Expected: 4.17.15
 */
export function getLibBLodashVersion(): string {
  return _.VERSION;
}

/**
 * Returns a unique identifier for the rxjs Observable class.
 * If peer dependencies work correctly, all libs should return the same value.
 */
export function getLibBRxjsIdentity(): string {
  return rxjsIdentity;
}

/**
 * A simple utility function to demonstrate lib-b functionality.
 * Uses lodash to ensure the import is real, not tree-shaken.
 */
export function libBGreeting(name: string): string {
  return _.capitalize(`hello from lib-b, ${name}!`);
}

/**
 * Metadata about this library for debugging.
 */
export const LIB_B_INFO = {
  name: '@myorg/lib-b',
  lodashVersion: _.VERSION,
  expectedLodashVersion: '4.17.15',
  isVersionCorrect: _.VERSION === '4.17.15',
} as const;

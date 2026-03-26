import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import * as _ from 'lodash';
import { Observable } from 'rxjs';
import {
  getLibALodashVersion,
  getLibARxjsIdentity,
  getLibBLodashVersion,
  getLibBRxjsIdentity,
  getVersionReport,
  libAGreeting,
  libBGreeting,
} from '@myorg/lib-a';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Lodash Version Isolation', () => {
  it('app should use lodash@4.17.20', () => {
    expect(_.VERSION).toBe('4.17.20');
  });

  it('lib-a should use lodash@4.17.21', () => {
    expect(getLibALodashVersion()).toBe('4.17.21');
  });

  it('lib-b should use lodash@4.17.15', () => {
    expect(getLibBLodashVersion()).toBe('4.17.15');
  });

  it('all lodash versions should be different', () => {
    const appVersion = _.VERSION;
    const libAVersion = getLibALodashVersion();
    const libBVersion = getLibBLodashVersion();

    expect(appVersion).not.toBe(libAVersion);
    expect(appVersion).not.toBe(libBVersion);
    expect(libAVersion).not.toBe(libBVersion);
  });
});

describe('Peer Dependency Sharing (rxjs)', () => {
  it('lib-a and lib-b should share the same rxjs Observable', () => {
    const libARxjs = getLibARxjsIdentity();
    const libBRxjs = getLibBRxjsIdentity();
    expect(libARxjs).toBe(libBRxjs);
  });
});

describe('Library Functions', () => {
  it('libAGreeting should work', () => {
    const result = libAGreeting('test');
    expect(result).toBe('Hello from lib-a, test!');
  });

  it('libBGreeting should work', () => {
    const result = libBGreeting('test');
    expect(result).toBe('Hello from lib-b, test!');
  });
});

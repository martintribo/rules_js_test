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

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});

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

  it('version report should show all versions correct', () => {
    const report = getVersionReport();

    expect(report.libA.isCorrect).toBe(true);
    expect(report.libB.isCorrect).toBe(true);
  });
});

describe('Peer Dependency Sharing (rxjs)', () => {
  it('app and lib-a should share the same rxjs Observable', () => {
    const appRxjs = Observable.toString();
    const libARxjs = getLibARxjsIdentity();

    expect(appRxjs).toBe(libARxjs);
  });

  it('app and lib-b should share the same rxjs Observable', () => {
    const appRxjs = Observable.toString();
    const libBRxjs = getLibBRxjsIdentity();

    expect(appRxjs).toBe(libBRxjs);
  });

  it('lib-a and lib-b should share the same rxjs Observable', () => {
    const libARxjs = getLibARxjsIdentity();
    const libBRxjs = getLibBRxjsIdentity();

    expect(libARxjs).toBe(libBRxjs);
  });

  it('version report should confirm rxjs is shared', () => {
    const report = getVersionReport();

    expect(report.peerDependencyCheck.rxjsShared).toBe(true);
  });
});

describe('Library Functions', () => {
  it('libAGreeting should work and use lodash', () => {
    const result = libAGreeting('test');
    expect(result).toBe('Hello from lib-a, test!');
  });

  it('libBGreeting should work and use lodash', () => {
    const result = libBGreeting('test');
    expect(result).toBe('Hello from lib-b, test!');
  });
});

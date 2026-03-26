import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  type VersionReport,
} from '@myorg/lib-a';

interface VersionCheck {
  name: string;
  actual: string;
  expected: string;
  isCorrect: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="version-report">
      <h1>Angular 21 - Vitest Unit Test</h1>
      <p>This app tests rules_js + pnpm symlinks + Angular's new application builder.</p>

      <h2>Lodash Version Isolation Test</h2>
      <p>Each package should load its own version of lodash:</p>

      <div *ngFor="let check of lodashChecks"
           class="version-item"
           [class.success]="check.isCorrect"
           [class.error]="!check.isCorrect">
        <strong>{{ check.name }}:</strong>
        <code>{{ check.actual }}</code>
        (expected: <code>{{ check.expected }}</code>)
        <span *ngIf="check.isCorrect">✓</span>
        <span *ngIf="!check.isCorrect">✗</span>
      </div>

      <h2>Peer Dependency Test (rxjs)</h2>
      <p>All packages should share the same rxjs Observable class:</p>

      <div class="version-item"
           [class.success]="peerDepShared"
           [class.error]="!peerDepShared">
        <strong>Peer Dependency Shared:</strong>
        {{ peerDepShared ? 'Yes - All packages use the same rxjs instance' : 'No - rxjs is not properly shared' }}
      </div>

      <h2>Library Function Test</h2>
      <div class="version-item info">
        <strong>lib-a greeting:</strong> {{ libAMessage }}
      </div>
      <div class="version-item info">
        <strong>lib-b greeting:</strong> {{ libBMessage }}
      </div>

      <h2>Full Version Report</h2>
      <pre>{{ versionReport | json }}</pre>

      <h2>Summary</h2>
      <div class="version-item" [class.success]="allTestsPassed" [class.error]="!allTestsPassed">
        <strong>All Tests Passed:</strong> {{ allTestsPassed ? 'Yes ✓' : 'No ✗' }}
      </div>
    </div>
  `,
})
export class AppComponent implements OnInit {
  lodashChecks: VersionCheck[] = [];
  peerDepShared = false;
  libAMessage = '';
  libBMessage = '';
  versionReport: VersionReport | null = null;
  allTestsPassed = false;

  ngOnInit(): void {
    // Get version report from lib-a
    this.versionReport = getVersionReport();

    // Build lodash version checks
    this.lodashChecks = [
      {
        name: 'App (this app)',
        actual: _.VERSION,
        expected: '4.17.20',
        isCorrect: _.VERSION === '4.17.20',
      },
      {
        name: 'lib-a',
        actual: getLibALodashVersion(),
        expected: '4.17.21',
        isCorrect: getLibALodashVersion() === '4.17.21',
      },
      {
        name: 'lib-b',
        actual: getLibBLodashVersion(),
        expected: '4.17.15',
        isCorrect: getLibBLodashVersion() === '4.17.15',
      },
    ];

    // Check if peer dependency is shared by comparing Observable identity
    const appRxjs = Observable.toString();
    const libARxjs = getLibARxjsIdentity();
    const libBRxjs = getLibBRxjsIdentity();
    this.peerDepShared = appRxjs === libARxjs && libARxjs === libBRxjs;

    // Test library functions
    this.libAMessage = libAGreeting('world');
    this.libBMessage = libBGreeting('world');

    // Overall test result
    const lodashPassed = this.lodashChecks.every((c) => c.isCorrect);
    this.allTestsPassed = lodashPassed && this.peerDepShared;

    // Log to console for easy verification
    console.log('=== rules_js + pnpm + Angular Test Results ===');
    console.log('Lodash versions:', {
      app: _.VERSION,
      libA: getLibALodashVersion(),
      libB: getLibBLodashVersion(),
    });
    console.log('rxjs peer dep shared:', this.peerDepShared);
    console.log('All tests passed:', this.allTestsPassed);
  }
}

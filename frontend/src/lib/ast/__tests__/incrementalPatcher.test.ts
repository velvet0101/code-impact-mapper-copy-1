import { parseSourceFile, buildCodeImpactData } from '../jsParser';
import { calculateBlastRadius } from '../blastRadius';
import { patchIncrementalFile } from '../incrementalPatcher';

function runTests() {
  console.log('🧪 Starting Incremental Patcher Tests...');

  // Setup baseline repository files
  const file1Path = 'src/service.ts';
  const file1Code = `
    export function processOrder(orderId: string) {
      validateOrder(orderId);
      return true;
    }

    export function validateOrder(id: string) {
      return id.length > 0;
    }
  `;

  const file2Path = 'src/notifier.ts';
  const file2Code = `
    export function sendNotification(msg: string) {
      console.log(msg);
    }
  `;

  const parsed1 = parseSourceFile(file1Path, file1Code);
  const parsed2 = parseSourceFile(file2Path, file2Code);

  const baselineData = buildCodeImpactData('test-repo', [parsed1, parsed2], {
    [file1Path]: file1Code,
    [file2Path]: file2Code,
  });

  const baselineBlast = calculateBlastRadius('src/notifier.ts#sendNotification', baselineData.functions);
  console.log('Initial sendNotification callers count:', baselineBlast.directCallerIds.length);
  console.log('Initial sendNotification impact score:', baselineBlast.impactScore);

  if (baselineBlast.directCallerIds.length !== 0) {
    throw new Error(`Expected 0 initial callers for sendNotification, got ${baselineBlast.directCallerIds.length}`);
  }

  // --- TEST 1: Add a call to sendNotification from processOrder ---
  console.log('\n--- TEST 1: Live Edit - Add call to sendNotification ---');
  const editedFile1Code = `
    export function processOrder(orderId: string) {
      validateOrder(orderId);
      sendNotification("Order processed: " + orderId);
      return true;
    }

    export function validateOrder(id: string) {
      return id.length > 0;
    }
  `;

  const patch1 = patchIncrementalFile(
    file1Path,
    editedFile1Code,
    baselineData.functions,
    baselineData.functions,
    'src/notifier.ts#sendNotification',
    new Set()
  );

  if (!patch1.success) {
    throw new Error(`Patch 1 failed: ${patch1.error}`);
  }

  console.log('Added edge IDs:', patch1.diffMetadata.addedEdgeIds);
  console.log('Dirty files:', patch1.diffMetadata.dirtyFiles);
  console.log('Risk delta map:', patch1.diffMetadata.riskDeltaMap);
  console.log('Updated sendNotification callers:', patch1.updatedFunctions['src/notifier.ts#sendNotification']?.callers);
  console.log('Updated processOrder callees:', patch1.updatedFunctions['src/service.ts#processOrder']?.callees);

  if (!patch1.diffMetadata.addedEdgeIds.includes('e-src/service.ts#processOrder->src/notifier.ts#sendNotification')) {
    throw new Error('Expected newly added call edge to be detected');
  }

  if (!patch1.updatedFunctions['src/notifier.ts#sendNotification'].callers.includes('src/service.ts#processOrder')) {
    throw new Error('Expected processOrder to be registered as caller of sendNotification');
  }

  const newBlast = patch1.updatedBlastRadius;
  if (!newBlast || newBlast.directCallerIds.length !== 1) {
    throw new Error(`Expected 1 direct caller for sendNotification, got ${newBlast?.directCallerIds.length}`);
  }
  console.log('Updated blast radius score for sendNotification:', newBlast.impactScore);
  if (newBlast.impactScore <= baselineBlast.impactScore) {
    throw new Error('Expected impact score to increase after new caller is added');
  }
  console.log('✅ TEST 1 PASSED: Incremental call addition and blast radius cascade verified!');

  // --- TEST 2: Add a new function in the edited file ---
  console.log('\n--- TEST 2: Live Edit - Add a brand new function ---');
  const file1WithNewFn = `
    export function processOrder(orderId: string) {
      validateOrder(orderId);
      sendNotification("Order processed: " + orderId);
      return true;
    }

    export function validateOrder(id: string) {
      return id.length > 0;
    }

    export function cancelOrder(orderId: string) {
      sendNotification("Order cancelled: " + orderId);
    }
  `;

  const patch2 = patchIncrementalFile(
    file1Path,
    file1WithNewFn,
    patch1.updatedFunctions,
    baselineData.functions,
    'src/notifier.ts#sendNotification',
    new Set(patch1.diffMetadata.dirtyFiles)
  );

  if (!patch2.success) {
    throw new Error(`Patch 2 failed: ${patch2.error}`);
  }

  console.log('Added function IDs:', patch2.diffMetadata.addedFunctionIds);
  if (!patch2.diffMetadata.addedFunctionIds.includes('src/service.ts#cancelOrder')) {
    throw new Error('Expected cancelOrder to be detected in addedFunctionIds');
  }
  if (!patch2.updatedFunctions['src/service.ts#cancelOrder']) {
    throw new Error('Expected cancelOrder to exist in patched functions map');
  }
  if (patch2.updatedBlastRadius?.directCallerIds.length !== 2) {
    throw new Error(`Expected 2 callers for sendNotification now, got ${patch2.updatedBlastRadius?.directCallerIds.length}`);
  }
  console.log('✅ TEST 2 PASSED: Incremental function addition verified!');

  // --- TEST 3: Remove a function ---
  console.log('\n--- TEST 3: Live Edit - Delete validateOrder function ---');
  const file1WithRemovedFn = `
    export function processOrder(orderId: string) {
      sendNotification("Order processed: " + orderId);
      return true;
    }

    export function cancelOrder(orderId: string) {
      sendNotification("Order cancelled: " + orderId);
    }
  `;

  const patch3 = patchIncrementalFile(
    file1Path,
    file1WithRemovedFn,
    patch2.updatedFunctions,
    baselineData.functions,
    'src/notifier.ts#sendNotification',
    new Set(patch2.diffMetadata.dirtyFiles)
  );

  if (!patch3.success) {
    throw new Error(`Patch 3 failed: ${patch3.error}`);
  }

  console.log('Removed function IDs:', patch3.diffMetadata.removedFunctionIds);
  if (!patch3.diffMetadata.removedFunctionIds.includes('src/service.ts#validateOrder')) {
    throw new Error('Expected validateOrder to be in removedFunctionIds');
  }
  if (patch3.updatedFunctions['src/service.ts#validateOrder']) {
    throw new Error('Expected validateOrder to be removed from functions map');
  }
  console.log('✅ TEST 3 PASSED: Incremental function deletion and unlinking verified!');

  // --- TEST 4: Revert file back to original baseline ---
  console.log('\n--- TEST 4: Revert back to original baseline code ---');
  const patch4 = patchIncrementalFile(
    file1Path,
    file1Code,
    patch3.updatedFunctions,
    baselineData.functions,
    'src/notifier.ts#sendNotification',
    new Set()
  );

  if (!patch4.success) {
    throw new Error(`Patch 4 failed: ${patch4.error}`);
  }

  console.log('Reverted sendNotification callers:', patch4.updatedBlastRadius?.directCallerIds);
  if (patch4.updatedBlastRadius?.directCallerIds.length !== 0) {
    throw new Error(`Expected 0 callers after revert, got ${patch4.updatedBlastRadius?.directCallerIds.length}`);
  }
  if (patch4.diffMetadata.addedEdgeIds.length !== 0) {
    throw new Error(`Expected 0 addedEdgeIds after revert, got ${patch4.diffMetadata.addedEdgeIds.length}`);
  }
  console.log('✅ TEST 4 PASSED: Clean reversion to baseline verified!');

  console.log('\n🎉 ALL INCREMENTAL PATCHER TESTS PASSED SUCCESSFULLY!\n');
}

runTests();

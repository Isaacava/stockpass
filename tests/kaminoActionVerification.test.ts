import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actualInstructionFingerprint,
  expectedInstructionFingerprint,
  verifyPreparedKaminoInstructionSet,
} from '../src/lib/kaminoActionVerification.ts';

test('exact Kamino instruction set accepts identical prepared and confirmed instructions', () => {
  const expected = [
    expectedInstructionFingerprint({
      programAddress: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
      accounts: [{ address: 'AccountA' }, { address: 'AccountB' }],
      data: 'AA==',
    }),
  ];
  const actual = [
    actualInstructionFingerprint({
      programId: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
      accounts: ['AccountA', 'AccountB'],
      data: '1',
    }),
  ];

  assert.equal(verifyPreparedKaminoInstructionSet(actual, expected), true);
});

test('tampered instruction data is rejected', () => {
  const expected = [
    expectedInstructionFingerprint({
      programAddress: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
      accounts: [{ address: 'AccountA' }],
      data: 'AA==',
    }),
  ];
  const tampered = [
    actualInstructionFingerprint({
      programId: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
      accounts: ['AccountA'],
      data: '2',
    }),
  ];

  assert.equal(verifyPreparedKaminoInstructionSet(tampered, expected), false);
});

test('extra or reordered Kamino instructions are rejected', () => {
  const first = expectedInstructionFingerprint({
    programAddress: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
    accounts: [{ address: 'AccountA' }],
    data: 'AA==',
  });
  const second = expectedInstructionFingerprint({
    programAddress: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
    accounts: [{ address: 'AccountB' }],
    data: 'AA==',
  });

  assert.equal(verifyPreparedKaminoInstructionSet([first, second], [first]), false);
  assert.equal(verifyPreparedKaminoInstructionSet([second, first], [first, second]), false);
});

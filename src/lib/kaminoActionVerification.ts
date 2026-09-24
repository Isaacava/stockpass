export type TransactionFingerprint = {
  programId: string;
  accounts: string;
  data: string;
};

export function base58ToBase64(value: string): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let decodedNumber = 0n;
  for (const char of value) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid base58 instruction data.');
    decodedNumber = decodedNumber * 58n + BigInt(index);
  }

  const bytes: number[] = [];
  while (decodedNumber > 0n) {
    bytes.unshift(Number(decodedNumber & 255n));
    decodedNumber >>= 8n;
  }

  let leadingZeros = 0;
  for (let i = 0; i < value.length && value[i] === '1'; i += 1) leadingZeros += 1;
  if (leadingZeros) bytes.unshift(...Array.from({ length: leadingZeros }, () => 0));

  return Buffer.from(bytes).toString('base64');
}

export function actualInstructionFingerprint(instruction: {
  programId: string;
  accounts: Array<string | { pubkey?: string }>;
  data: string;
}): TransactionFingerprint {
  return {
    programId: String(instruction.programId || ''),
    accounts: (instruction.accounts ?? [])
      .map((account) => typeof account === 'string' ? account : String(account?.pubkey || account))
      .join(','),
    data: base58ToBase64(String(instruction.data || '')),
  };
}

export function expectedInstructionFingerprint(instruction: {
  programAddress: string;
  accounts: Array<{ address: string }>;
  data: string;
}): TransactionFingerprint {
  return {
    programId: String(instruction.programAddress || ''),
    accounts: (instruction.accounts ?? []).map((account) => String(account.address || '')).join(','),
    data: String(instruction.data || ''),
  };
}

export function verifyPreparedKaminoInstructionSet(
  actual: TransactionFingerprint[],
  expected: TransactionFingerprint[],
): boolean {
  if (!expected.length || actual.length !== expected.length) return false;
  return expected.every((instruction, index) => {
    const candidate = actual[index];
    return candidate?.programId === instruction.programId
      && candidate.accounts === instruction.accounts
      && candidate.data === instruction.data;
  });
}

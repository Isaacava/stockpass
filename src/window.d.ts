export {};

declare global {
  interface Window {
    solana?: {
      publicKey?: { toString(): string };
    };
  }
}

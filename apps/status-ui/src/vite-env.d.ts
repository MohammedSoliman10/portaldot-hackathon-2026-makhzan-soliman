/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAKHZAN_MODE?: string;
  readonly VITE_MAKHZAN_RPC_URL?: string;
  readonly VITE_MAKHZAN_CHAIN_ID?: string;
  readonly VITE_MAKHZAN_CONTRACT_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __BUILD_ID__: string;

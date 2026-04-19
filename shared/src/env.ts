export const requiredWebEnvKeys = [
  "NEXT_PUBLIC_SUI_NETWORK",
  "NEXT_PUBLIC_PACKAGE_ID",
  "NEXT_PUBLIC_WALRUS_PUBLISHER",
  "NEXT_PUBLIC_WALRUS_AGGREGATOR",
  "NEXT_PUBLIC_ENOKI_API_KEY"
] as const;

export type RequiredWebEnvKey = (typeof requiredWebEnvKeys)[number];

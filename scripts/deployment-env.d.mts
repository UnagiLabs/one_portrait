export type DeploymentManifest = {
  readonly adminCapId: string;
  readonly enokiPublicApiKey: string;
  readonly googleClientId: string;
  readonly network: "mainnet" | "testnet" | "devnet" | "localnet";
  readonly packageId: string;
  readonly registryObjectId: string;
  readonly walrusAggregator: string;
  readonly walrusPublisher: string;
};

export const webPublicEnvKeys: readonly string[];
export const generatorEnvKeys: readonly string[];

export class InvalidDeploymentManifestError extends Error {}

export function parseDeploymentManifest(
  input: unknown,
  source?: string,
): DeploymentManifest;

export function toWebPublicEnv(
  manifest: DeploymentManifest,
): Record<string, string>;

export function toGeneratorEnv(
  manifest: DeploymentManifest,
): Record<string, string>;

export function checkPublishedTomlDrift(options?: {
  readonly manifest?: DeploymentManifest;
  readonly publishedTomlPath?: string;
  readonly repoRoot?: string;
}): {
  readonly packageId: string;
  readonly publishedAt: string | null;
};

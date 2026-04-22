import path from "node:path";

import {
  createProgressAwareSubmissionHelper,
  createSeedingDigestStatusChecker,
  createSeedingDemoSubmissionRunner,
  createSeedingSnapshotLoader,
  createSeedingWalrusUploadClient,
  createSuiClient,
  createSubmitPhotoTransactionExecutor,
  deriveSeedingSenders,
  loadSeedingInputFromDirectory,
  loadSeedingInputFromManifest,
  loadSeedingSenderConfig,
  parseSeedingDemoSubmissionArgs,
  preprocessSeedingImage,
  readSeedingLedger,
  type SeedingDemoSubmissionCliArgs,
  type SeedingDemoSubmissionRunnerDeps,
  writeSeedingLedger,
} from "../src";

type SeedingRuntimeEnv = {
  readonly packageId: string;
  readonly suiNetwork: "mainnet" | "testnet" | "devnet" | "localnet";
  readonly walrusAggregatorBaseUrl: string;
  readonly walrusPublisherBaseUrl: string;
};

async function main() {
  const args = parseSeedingDemoSubmissionArgs(process.argv.slice(2));
  const env = readRuntimeEnv(args.mode);
  const suiClient = createSuiClient({ network: env.suiNetwork });
  const readSeedingSnapshot = createSeedingSnapshotLoader(suiClient);
  const checkDigestStatus = createSeedingDigestStatusChecker(suiClient);
  const senderConfigPath = path.resolve(args.senderConfig);
  const senderConfig = await loadSeedingSenderConfig(senderConfigPath);
  const senders = deriveSeedingSenders(senderConfig);

  const submitPhotoForSender =
    args.mode === "live"
      ? await buildSubmitPhotoForSender({
          env,
          readSeedingSnapshot,
          senders,
          suiClient,
        })
      : async () => {
          throw new Error("simulate mode must not submit photos.");
        };

  const deps: SeedingDemoSubmissionRunnerDeps = {
    checkDigestStatus,
    deriveSenders: () => senders,
    loadInputEntries: async (input) => {
      if (input.manifest !== null) {
        return loadSeedingInputFromManifest(path.resolve(input.manifest));
      }

      if (input.images !== null) {
        return loadSeedingInputFromDirectory(path.resolve(input.images));
      }

      throw new Error("Provide either --images or --manifest.");
    },
    loadSenderConfig: async () => senderConfig,
    preprocessSeedingImage,
    putBlob:
      args.mode === "live"
        ? createSeedingWalrusUploadClient({
            publisherBaseUrl: env.walrusPublisherBaseUrl,
            aggregatorBaseUrl: env.walrusAggregatorBaseUrl,
          }).putBlob
        : async () => {
            throw new Error("simulate mode must not upload blobs.");
          },
    readLedger: async (filePath) => readSeedingLedger(path.resolve(filePath)),
    readSeedingSnapshot,
    submitPhotoForSender,
    writeLedger: async (filePath, ledger) =>
      writeSeedingLedger(path.resolve(filePath), ledger),
  };

  const runner = createSeedingDemoSubmissionRunner(deps);
  const result = await runner.run(args);
  console.log(JSON.stringify(result.summary, null, 2));
}

async function buildSubmitPhotoForSender(input: {
  readonly env: SeedingRuntimeEnv;
  readonly readSeedingSnapshot: ReturnType<typeof createSeedingSnapshotLoader>;
  readonly senders: ReturnType<typeof deriveSeedingSenders>;
  readonly suiClient: ReturnType<typeof createSuiClient>;
}): Promise<
  SeedingDemoSubmissionRunnerDeps["submitPhotoForSender"]
> {
  const submitters = new Map(
    input.senders.map((sender) => [
      sender.address,
      createProgressAwareSubmissionHelper({
        readSeedingSnapshot: input.readSeedingSnapshot,
        submitPhoto: createSubmitPhotoTransactionExecutor({
          client: input.suiClient,
          packageId: input.env.packageId,
          privateKey: sender.privateKey,
        }),
      }),
    ]),
  );

  return async (senderAddress, args) => {
    const submitter = submitters.get(senderAddress);

    if (submitter === undefined) {
      throw new Error(`Missing sender executor for ${senderAddress}.`);
    }

    return submitter(args);
  };
}

function readRuntimeEnv(
  mode: SeedingDemoSubmissionCliArgs["mode"],
): SeedingRuntimeEnv {
  const suiNetwork = readRequiredEnv("SUI_NETWORK");
  const packageId = readOptionalEnv("PACKAGE_ID");
  const walrusPublisherBaseUrl = readOptionalEnv("WALRUS_PUBLISHER");
  const walrusAggregatorBaseUrl = readOptionalEnv("WALRUS_AGGREGATOR");

  if (mode === "live") {
    if (packageId === null) {
      throw new Error("Missing required env var: PACKAGE_ID");
    }

    if (walrusPublisherBaseUrl === null) {
      throw new Error("Missing required env var: WALRUS_PUBLISHER");
    }

    if (walrusAggregatorBaseUrl === null) {
      throw new Error("Missing required env var: WALRUS_AGGREGATOR");
    }
  }

  if (
    suiNetwork !== "mainnet" &&
    suiNetwork !== "testnet" &&
    suiNetwork !== "devnet" &&
    suiNetwork !== "localnet"
  ) {
    throw new Error(
      `SUI_NETWORK must be one of mainnet, testnet, devnet, or localnet (got "${suiNetwork}").`,
    );
  }

  return {
    packageId: packageId ?? "",
    suiNetwork,
    walrusAggregatorBaseUrl: walrusAggregatorBaseUrl ?? "",
    walrusPublisherBaseUrl: walrusPublisherBaseUrl ?? "",
  };
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value.trim();
}

function readOptionalEnv(name: string): string | null {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

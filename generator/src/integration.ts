/**
 * Generator integration entrypoint.
 *
 * This barrel contains runtime adapters and operational helpers for
 * Sui/Walrus-backed finalize flows. Teams wiring the generator into the
 * broader product can import from here without mixing that concern into
 * the pure mosaic-generation API.
 */

export {
  type GeneratorRuntimeEnv,
  loadGeneratorRuntimeEnv,
  MissingGeneratorRuntimeEnvError,
  type SuiNetwork,
} from "./env";
export {
  createDefaultFinalizeRunner,
  createFinalizeRunner,
  createFinalizeRunnerFromEndpoints,
  type FinalizeRunner,
  type FinalizeRunResult,
  type GeneratorFinalizeSnapshot,
} from "./runtime";
export {
  loadSeedingInputFromDirectory,
  loadSeedingInputFromManifest,
  type SeedingInputEntry,
} from "./seeding-input";
export {
  createEmptySeedingLedger,
  readSeedingLedger,
  type SeedingLedger,
  type SeedingLedgerRow,
  type SeedingLedgerRowStatus,
  writeSeedingLedger,
} from "./seeding-ledger";
export {
  type SeedingPreflightResult,
  validateSeedingPreflight,
} from "./seeding-preflight";
export {
  reconcileSeedingLedger,
  type SeedingDigestStatus,
  type SeedingDigestStatusChecker,
  type SeedingReconciliationResult,
  type SeedingReconciliationSummary,
} from "./seeding-reconciliation";
export {
  buildSeedingLedgerRows,
  createSeedingDemoSubmissionRunner,
  deriveSeedingSenders,
  loadSeedingSenderConfig,
  parseSeedingDemoSubmissionArgs,
  parseSeedingSenderConfig,
  type SeedingDemoSubmissionCliArgs,
  type SeedingDemoSubmissionMode,
  type SeedingDemoSubmissionRunner,
  type SeedingDemoSubmissionRunnerDeps,
  type SeedingDemoSubmissionRunResult,
  type SeedingDemoSubmissionRunSummary,
  type SeedingSender,
  type SeedingSenderConfigEntry,
} from "./seeding-runner";
export {
  createProgressAwareSubmissionHelper,
  type ProgressAwareSubmissionResult,
  type SubmitPhotoTransactionExecutor,
  validateFinalSubmissionPostcondition,
} from "./seeding-submit";
export {
  createSeedingWalrusUploadClient,
  preprocessSeedingImage,
  type SeedingPreprocessedImage,
  type SeedingPreprocessLog,
  type SeedingPreprocessMetadata,
  type SeedingUploadCandidate,
  type SeedingWalrusUploadClient,
  type SeedingWalrusUploadError,
  type SeedingWalrusUploadResult,
  validateUniqueSeedingBlobIds,
} from "./seeding-upload";
export {
  type CreateUnitTransactionResult,
  createCreateUnitTransactionExecutor,
  createFinalizeTransactionExecutor,
  createRotateCurrentUnitTransactionExecutor,
  createSeedingDigestStatusChecker,
  createSeedingSnapshotLoader,
  createSubmitPhotoTransactionExecutor,
  createSuiClient,
  createUnitSnapshotLoader,
  createUpsertAthleteMetadataTransactionExecutor,
  type FinalizeTransactionResult,
  type GeneratorSeedingSnapshot,
  type GeneratorSeedingSnapshotLoader,
  type GeneratorUnitSnapshotLoader,
  type RotateCurrentUnitTransactionResult,
  readTransactionBlockStatus,
  type SubmitPhotoTransactionResult,
  type UpsertAthleteMetadataTransactionResult,
} from "./sui";
export {
  createWalrusReadClient,
  type WalrusReadClient,
  WalrusReadError,
} from "./walrus";
export {
  createWalrusWriteClient,
  type WalrusWriteClient,
  WalrusWriteError,
} from "./walrus-write";

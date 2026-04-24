import { bcs } from "@mysten/sui/bcs";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import type {
  GeneratorSubmissionRef,
  GeneratorUnitSnapshot,
} from "@one-portrait/shared";
import type { MosaicPlacement } from "./assignment";
import type { SuiNetwork } from "./env";
import type { SeedingDigestStatus } from "./seeding-reconciliation";

export type GeneratorFinalizeSnapshot = GeneratorUnitSnapshot & {
  readonly masterId: string | null;
  readonly status: "filled" | "finalized" | "pending";
};

export type GeneratorSeedingSnapshot = GeneratorFinalizeSnapshot & {
  readonly maxSlots: number;
  readonly submittedCount: number;
  readonly submitterAddresses: readonly string[];
};

export type GeneratorUnitSnapshotLoader = (
  unitId: string,
) => Promise<GeneratorFinalizeSnapshot>;

export type GeneratorSeedingSnapshotLoader = (
  unitId: string,
) => Promise<GeneratorSeedingSnapshot>;

export type FinalizeTransactionResult = {
  readonly digest: string;
};

export type CreateUnitTransactionResult = {
  readonly digest: string;
  readonly unitId: string;
};

export type GeneratorSuiReadClient = Pick<SuiJsonRpcClient, "getObject">;

export type GeneratorSuiTransactionBlockClient = Pick<
  SuiJsonRpcClient,
  "getTransactionBlock"
>;

export type GeneratorSuiWriteClient = Pick<
  SuiJsonRpcClient,
  "signAndExecuteTransaction" | "waitForTransaction"
>;

export type SubmitPhotoTransactionResult = {
  readonly digest: string;
  readonly senderAddress: string;
};

export function createSuiClient(options: {
  readonly network: SuiNetwork;
}): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    network: options.network,
    url: getJsonRpcFullnodeUrl(options.network),
  });
}

export function createUnitSnapshotLoader(
  client: GeneratorSuiReadClient,
): GeneratorUnitSnapshotLoader {
  return async (unitId: string) => {
    const snapshot = await readUnitSnapshot(client, unitId);

    return {
      unitId,
      displayName: snapshot.displayName,
      displayMaxSlots: snapshot.displayMaxSlots,
      targetWalrusBlobId: snapshot.targetWalrusBlobId,
      submissions: snapshot.submissions,
      status: snapshot.status,
      masterId: snapshot.masterId,
    };
  };
}

export function createSeedingSnapshotLoader(
  client: GeneratorSuiReadClient,
): GeneratorSeedingSnapshotLoader {
  return (unitId: string) => readUnitSnapshot(client, unitId);
}

export function createFinalizeTransactionExecutor(input: {
  readonly adminCapId: string;
  readonly client: GeneratorSuiWriteClient;
  readonly packageId: string;
  readonly privateKey: string;
}): (args: {
  readonly mosaicBlobId: string;
  readonly placements: readonly MosaicPlacement[];
  readonly unitId: string;
}) => Promise<FinalizeTransactionResult> {
  const signer = Ed25519Keypair.fromSecretKey(input.privateKey);

  return async (args) => {
    const tx = new Transaction();

    const encodedMosaicBlobId = tx.pure.vector(
      "u8",
      Array.from(new TextEncoder().encode(args.mosaicBlobId)),
    );

    if (args.placements.length === 0) {
      tx.moveCall({
        target: `${input.packageId}::admin_api::finalize_empty`,
        arguments: [
          tx.object(input.adminCapId),
          tx.object(args.unitId),
          encodedMosaicBlobId,
        ],
      });
    } else {
      const encodedPlacements = args.placements.map((placement) => ({
        blobId: Array.from(new TextEncoder().encode(placement.walrusBlobId)),
        submissionNo: placement.submissionNo,
        submitter: placement.submitter,
        x: placement.x,
        y: placement.y,
      }));

      tx.moveCall({
        target: `${input.packageId}::admin_api::finalize_with_primitive_placements`,
        arguments: [
          tx.object(input.adminCapId),
          tx.object(args.unitId),
          encodedMosaicBlobId,
          tx.pure(
            bcs
              .vector(bcs.vector(bcs.u8()))
              .serialize(
                encodedPlacements.map((placement) => placement.blobId),
              ),
          ),
          tx.pure(
            bcs
              .vector(bcs.u16())
              .serialize(encodedPlacements.map((placement) => placement.x)),
          ),
          tx.pure(
            bcs
              .vector(bcs.u16())
              .serialize(encodedPlacements.map((placement) => placement.y)),
          ),
          tx.pure(
            bcs
              .vector(bcs.Address)
              .serialize(
                encodedPlacements.map((placement) => placement.submitter),
              ),
          ),
          tx.pure(
            bcs
              .vector(bcs.u64())
              .serialize(
                encodedPlacements.map((placement) => placement.submissionNo),
              ),
          ),
        ],
      });
    }

    const execution = await input.client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: {
        showEffects: true,
      },
    });

    const status = execution.effects?.status.status;
    if (status !== "success") {
      throw new Error(
        execution.effects?.status.error ?? "Finalize transaction failed.",
      );
    }

    await input.client.waitForTransaction({
      digest: execution.digest,
      options: {
        showEffects: true,
      },
    });

    return {
      digest: execution.digest,
    };
  };
}

export function createCreateUnitTransactionExecutor(input: {
  readonly adminCapId: string;
  readonly client: GeneratorSuiWriteClient;
  readonly packageId: string;
  readonly privateKey: string;
}): (args: {
  readonly blobId: string;
  readonly displayMaxSlots: number;
  readonly displayName: string;
  readonly maxSlots: number;
  readonly registryObjectId: string;
  readonly thumbnailUrl: string;
}) => Promise<CreateUnitTransactionResult> {
  const signer = Ed25519Keypair.fromSecretKey(input.privateKey);

  return async (args) => {
    const tx = new Transaction();

    tx.moveCall({
      target: `${input.packageId}::admin_api::create_unit`,
      arguments: [
        tx.object(input.adminCapId),
        tx.object(args.registryObjectId),
        tx.pure.vector(
          "u8",
          Array.from(new TextEncoder().encode(args.displayName)),
        ),
        tx.pure.vector(
          "u8",
          Array.from(new TextEncoder().encode(args.thumbnailUrl)),
        ),
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(args.blobId))),
        tx.pure(bcs.u64().serialize(args.maxSlots)),
        tx.pure(bcs.u64().serialize(args.displayMaxSlots)),
      ],
    });

    const execution = await input.client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    const status = execution.effects?.status.status;
    if (status !== "success") {
      throw new Error(
        execution.effects?.status.error ?? "Create unit transaction failed.",
      );
    }

    const confirmed = await input.client.waitForTransaction({
      digest: execution.digest,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    const unitId =
      extractCreatedUnitId(execution.objectChanges) ??
      extractCreatedUnitId(confirmed.objectChanges);
    if (!unitId) {
      throw new Error("Create unit transaction did not return a unit id.");
    }

    return {
      digest: execution.digest,
      unitId,
    };
  };
}

export function createSubmitPhotoTransactionExecutor(input: {
  readonly client: GeneratorSuiWriteClient;
  readonly packageId: string;
  readonly privateKey: string | Uint8Array;
}): (args: {
  readonly blobId: string;
  readonly unitId: string;
}) => Promise<SubmitPhotoTransactionResult> {
  const signer = Ed25519Keypair.fromSecretKey(input.privateKey);

  return async (args) => {
    const tx = new Transaction();

    tx.moveCall({
      target: `${input.packageId}::accessors::submit_photo`,
      arguments: [
        tx.object(args.unitId),
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(args.blobId))),
        tx.object.clock(),
      ],
    });

    const execution = await input.client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: {
        showEffects: true,
      },
    });

    const confirmed = await input.client.waitForTransaction({
      digest: execution.digest,
      options: {
        showEffects: true,
      },
    });

    if (readTransactionBlockStatus(confirmed) !== "success") {
      throw new Error(
        confirmed.effects?.status.error ?? "Submit photo transaction failed.",
      );
    }

    return {
      digest: execution.digest,
      senderAddress: signer.toSuiAddress(),
    };
  };
}

export function createSeedingDigestStatusChecker(
  client: GeneratorSuiTransactionBlockClient,
): (txDigest: string) => Promise<SeedingDigestStatus> {
  return async (txDigest: string) => {
    try {
      const transactionBlock = await client.getTransactionBlock({
        digest: txDigest,
        options: {
          showEffects: true,
        },
      });

      return readTransactionBlockStatus(transactionBlock);
    } catch {
      return "unknown";
    }
  };
}

type MoveStructLike = {
  readonly dataType: "moveObject";
  readonly fields: Record<string, unknown>;
};

function extractMoveObjectFields(content: unknown): Record<string, unknown> {
  if (
    typeof content === "object" &&
    content !== null &&
    (content as { dataType?: unknown }).dataType === "moveObject"
  ) {
    const fields = (content as MoveStructLike).fields;

    if (typeof fields === "object" && fields !== null) {
      return fields;
    }
  }

  throw new Error("Expected moveObject fields in getObject response.");
}

export function readTransactionBlockStatus(
  transactionBlock:
    | {
        readonly effects?: {
          readonly status?: {
            readonly status?: string;
          };
        } | null;
      }
    | null
    | undefined,
): SeedingDigestStatus {
  const status = transactionBlock?.effects?.status?.status;

  if (status === "success") {
    return "success";
  }

  if (status === "failure") {
    return "failed";
  }

  return "unknown";
}

function readSubmissions(value: unknown): readonly GeneratorSubmissionRef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry, index) => {
    const record = unwrapSubmissionRecord(entry);

    if (record === null) {
      throw new Error(`submissions[${index}] is not an object`);
    }

    return {
      submissionNo: readIntegerField(
        record.submission_no,
        `submissions[${index}].submission_no`,
      ),
      submitter: readAddressField(
        record.submitter,
        `submissions[${index}].submitter`,
      ),
      submittedAtMs: readIntegerField(
        record.submitted_at_ms,
        `submissions[${index}].submitted_at_ms`,
      ),
      walrusBlobId: readVectorU8AsString(
        record.walrus_blob_id,
        `submissions[${index}].walrus_blob_id`,
      ),
    };
  });
}

function unwrapSubmissionRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  if ("fields" in value) {
    const fields = (value as { fields?: unknown }).fields;

    if (typeof fields === "object" && fields !== null) {
      return fields as Record<string, unknown>;
    }
  }

  return value as Record<string, unknown>;
}

async function readUnitSnapshot(
  client: GeneratorSuiReadClient,
  unitId: string,
): Promise<GeneratorSeedingSnapshot> {
  const response = await client.getObject({
    id: unitId,
    options: {
      showContent: true,
      showType: true,
    },
  });
  const data = response.data;

  if (!data?.content) {
    throw new Error(`Unit object not found: ${unitId}`);
  }

  const fields = extractMoveObjectFields(data.content);
  const submissions = readSubmissions(fields.submissions);
  const submitterAddresses = uniqueSubmitterAddresses(submissions);

  return {
    unitId,
    displayName: readVectorU8AsString(fields.display_name, "display_name"),
    displayMaxSlots:
      readOptionalIntegerField(fields.display_max_slots, "display_max_slots") ??
      readIntegerField(fields.max_slots, "max_slots"),
    targetWalrusBlobId: readVectorU8AsString(
      fields.target_walrus_blob,
      "target_walrus_blob",
    ),
    submissions,
    submittedCount: submissions.length,
    maxSlots: readIntegerField(fields.max_slots, "max_slots"),
    status: normalizeUnitStatus(fields.status),
    masterId: extractOptionalId(fields.master_id),
    submitterAddresses,
  };
}

function normalizeUnitStatus(
  value: unknown,
): "filled" | "finalized" | "pending" {
  if (value === 0 || value === "0" || value === "pending") {
    return "pending";
  }

  if (value === 1 || value === "1" || value === "filled") {
    return "filled";
  }

  if (value === 2 || value === "2" || value === "finalized") {
    return "finalized";
  }

  throw new Error(`Unknown unit status: ${String(value)}`);
}

function readVectorU8AsString(value: unknown, label: string): string {
  if (!Array.isArray(value)) {
    throw new Error(`${label} is not a byte array`);
  }

  const bytes = new Uint8Array(value.length);

  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];

    if (typeof entry !== "number" || !Number.isInteger(entry)) {
      throw new Error(`${label}[${index}] is not an integer byte`);
    }

    bytes[index] = entry & 0xff;
  }

  return new TextDecoder().decode(bytes);
}

function readIntegerField(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^[0-9]+$/u.test(value)) {
    return Number(value);
  }

  throw new Error(`${label} is not a numeric value: ${String(value)}`);
}

function readOptionalIntegerField(
  value: unknown,
  label: string,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readIntegerField(value, label);
}

function readAddressField(value: unknown, label: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`${label} is not an address string`);
}

function extractOptionalId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  const inner =
    typeof value === "object" && value !== null && "fields" in value
      ? (value as { fields: unknown }).fields
      : value;

  if (typeof inner !== "object" || inner === null) {
    return null;
  }

  const vec = (inner as { vec?: unknown }).vec;

  if (Array.isArray(vec) && vec.length > 0 && typeof vec[0] === "string") {
    return vec[0];
  }

  return null;
}

function extractCreatedUnitId(
  objectChanges:
    | readonly {
        readonly objectId?: string;
        readonly objectType?: string;
        readonly type?: string;
      }[]
    | null
    | undefined,
): string | null {
  if (!Array.isArray(objectChanges)) {
    return null;
  }

  for (const change of objectChanges) {
    if (
      change?.type === "created" &&
      typeof change.objectId === "string" &&
      typeof change.objectType === "string" &&
      change.objectType.endsWith("::unit::Unit")
    ) {
      return change.objectId;
    }
  }

  return null;
}

function uniqueSubmitterAddresses(
  submissions: readonly GeneratorSubmissionRef[],
): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const submission of submissions) {
    if (seen.has(submission.submitter)) {
      continue;
    }

    seen.add(submission.submitter);
    result.push(submission.submitter);
  }

  return result;
}

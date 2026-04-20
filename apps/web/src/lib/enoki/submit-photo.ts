import type { EnokiNetwork } from "@mysten/enoki";
import { EnokiClient, EnokiClientError } from "@mysten/enoki";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID, isValidSuiObjectId, toBase64 } from "@mysten/sui/utils";

import { createSuiClient } from "../sui/client";
import type { SuiNetwork } from "../env";

import { ENOKI_JWT_HEADER, EnokiApiError } from "./api";
import {
  loadEnokiServerEnv,
  loadSubmitPublicEnv,
  MissingEnokiServerEnvError,
  MissingSubmitPublicEnvError,
} from "./env";

const WALRUS_BLOB_ID_PATTERN = /^[A-Za-z0-9._:-]{1,512}$/;

export type SubmitPhotoInput = {
  readonly unitId: string;
  readonly blobId: string;
};

export type ExecuteSponsoredInput = {
  readonly digest: string;
  readonly signature: string;
};

export type SponsorSubmitPhotoResult = {
  readonly bytes: string;
  readonly digest: string;
  readonly sender: string;
};

type RuntimeEnv = {
  readonly network: EnokiNetwork;
  readonly packageId: string;
  readonly privateApiKey: string;
};

type EnokiSponsorClient = Pick<
  EnokiClient,
  "getZkLogin" | "createSponsoredTransaction"
>;
type EnokiExecuteClient = Pick<
  EnokiClient,
  "getZkLogin" | "executeSponsoredTransaction"
>;

type SponsorDeps = {
  readonly enokiClient: EnokiSponsorClient;
  readonly buildTransactionKind: (
    input: SubmitPhotoInput & Pick<RuntimeEnv, "network" | "packageId">,
  ) => Promise<string>;
};

type ExecuteDeps = {
  readonly enokiClient: EnokiExecuteClient;
};

export function parseSubmitPhotoInput(input: unknown): SubmitPhotoInput {
  if (!isRecord(input)) {
    throw invalidArgs("送信内容の形式が正しくありません。");
  }

  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("unitId") || !keys.includes("blobId")) {
    throw invalidArgs("`unitId` と `blobId` だけを送ってください。");
  }

  const unitId = typeof input.unitId === "string" ? input.unitId.trim() : "";
  const blobId = typeof input.blobId === "string" ? input.blobId.trim() : "";

  if (!isValidSuiObjectId(unitId)) {
    throw invalidArgs("`unitId` の形式が不正です。");
  }

  if (!WALRUS_BLOB_ID_PATTERN.test(blobId)) {
    throw invalidArgs("`blobId` の形式が不正です。");
  }

  return {
    unitId,
    blobId,
  };
}

export function parseExecuteSponsoredInput(input: unknown): ExecuteSponsoredInput {
  if (!isRecord(input)) {
    throw invalidArgs("送信内容の形式が正しくありません。");
  }

  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("digest") || !keys.includes("signature")) {
    throw invalidArgs("`digest` と `signature` だけを送ってください。");
  }

  const digest = typeof input.digest === "string" ? input.digest.trim() : "";
  const signature =
    typeof input.signature === "string" ? input.signature.trim() : "";

  if (digest.length === 0 || signature.length === 0) {
    throw invalidArgs("`digest` と `signature` は必須です。");
  }

  return {
    digest,
    signature,
  };
}

export function readZkLoginJwt(headers: Headers): string {
  const jwt = headers.get(ENOKI_JWT_HEADER)?.trim() ?? "";

  if (jwt.length === 0) {
    throw new EnokiApiError(
      401,
      "auth_expired",
      "ログインが切れました。Google でもう一度ログインしてください。",
    );
  }

  return jwt;
}

export function resolveRuntimeEnv(
  source: Readonly<Record<string, string | undefined>>,
): RuntimeEnv {
  try {
    const publicEnv = loadSubmitPublicEnv(source);
    const serverEnv = loadEnokiServerEnv(source);
    const network = toEnokiNetwork(publicEnv.suiNetwork);

    return {
      network,
      packageId: publicEnv.packageId,
      privateApiKey: serverEnv.privateApiKey,
    };
  } catch (error) {
    if (
      error instanceof MissingSubmitPublicEnvError ||
      error instanceof MissingEnokiServerEnvError
    ) {
      throw new EnokiApiError(
        503,
        "submit_unavailable",
        "投稿用の設定がまだ揃っていません。",
      );
    }

    throw error;
  }
}

export async function sponsorSubmitPhoto(
  input: SubmitPhotoInput & { readonly jwt: string },
  env: RuntimeEnv,
  deps: SponsorDeps = createSponsorDeps(env.privateApiKey),
): Promise<SponsorSubmitPhotoResult> {
  try {
    const zkLogin = await deps.enokiClient.getZkLogin({
      jwt: input.jwt,
    });
    const transactionKindBytes = await deps.buildTransactionKind({
      network: env.network,
      packageId: env.packageId,
      unitId: input.unitId,
      blobId: input.blobId,
    });

    const sponsored = await deps.enokiClient.createSponsoredTransaction({
      network: env.network,
      sender: zkLogin.address,
      transactionKindBytes,
      allowedMoveCallTargets: [submitPhotoTarget(env.packageId)],
    });

    return {
      bytes: sponsored.bytes,
      digest: sponsored.digest,
      sender: zkLogin.address,
    };
  } catch (error) {
    throw mapEnokiError(error);
  }
}

export async function executeSponsoredSubmitPhoto(
  input: ExecuteSponsoredInput & { readonly jwt: string },
  env: RuntimeEnv,
  deps: ExecuteDeps = createExecuteDeps(env.privateApiKey),
): Promise<{ digest: string }> {
  try {
    await deps.enokiClient.getZkLogin({
      jwt: input.jwt,
    });

    return await deps.enokiClient.executeSponsoredTransaction({
      digest: input.digest,
      signature: input.signature,
    });
  } catch (error) {
    throw mapEnokiError(error);
  }
}

export async function buildSubmitPhotoTransactionKind(
  input: SubmitPhotoInput & Pick<RuntimeEnv, "network" | "packageId">,
): Promise<string> {
  const client = createSuiClient({
    network: input.network,
  });
  const tx = new Transaction();

  tx.moveCall({
    target: submitPhotoTarget(input.packageId),
    arguments: [
      tx.object(input.unitId),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(input.blobId))),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  const kindBytes = await tx.build({
    client,
    onlyTransactionKind: true,
  });

  return toBase64(kindBytes);
}

export function submitPhotoTarget(packageId: string): string {
  return `${packageId}::accessors::submit_photo`;
}

function createSponsorDeps(privateApiKey: string): SponsorDeps {
  return {
    enokiClient: new EnokiClient({
      apiKey: privateApiKey,
    }),
    buildTransactionKind: buildSubmitPhotoTransactionKind,
  };
}

function createExecuteDeps(privateApiKey: string): ExecuteDeps {
  return {
    enokiClient: new EnokiClient({
      apiKey: privateApiKey,
    }),
  };
}

function toEnokiNetwork(network: SuiNetwork): EnokiNetwork {
  if (network === "localnet") {
    throw new EnokiApiError(
      503,
      "submit_unavailable",
      "Enoki は localnet をサポートしていません。",
    );
  }

  return network;
}

function mapEnokiError(error: unknown): EnokiApiError {
  if (error instanceof EnokiApiError) {
    return error;
  }

  if (error instanceof EnokiClientError) {
    if (error.status === 401 || error.status === 403) {
      return new EnokiApiError(
        401,
        "auth_expired",
        "ログインが切れました。Google でもう一度ログインしてください。",
      );
    }

    return new EnokiApiError(
      502,
      "sponsor_failed",
      "スポンサー処理に失敗しました。時間をおいて、もう一度お試しください。",
    );
  }

  if (error instanceof Error) {
    return new EnokiApiError(502, "sponsor_failed", error.message);
  }

  return new EnokiApiError(
    502,
    "sponsor_failed",
    "スポンサー処理に失敗しました。時間をおいて、もう一度お試しください。",
  );
}

function invalidArgs(message: string): EnokiApiError {
  return new EnokiApiError(400, "invalid_args", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

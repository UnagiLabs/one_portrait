"use client";

import { getSession } from "@mysten/enoki";
import { useCurrentWallet, useSignTransaction } from "@mysten/dapp-kit";
import { useState } from "react";

import { ENOKI_JWT_HEADER, type EnokiApiErrorBody, type EnokiApiErrorCode } from "./api";

type SponsorSubmitPhotoResponse = {
  readonly bytes: string;
  readonly digest: string;
  readonly sender: string;
};

type ExecuteSponsoredResponse = {
  readonly digest: string;
};

export type SubmitPhotoSuccess = {
  readonly digest: string;
  readonly sender: string;
};

export class EnokiSubmitClientError extends Error {
  readonly status: number;
  readonly code: EnokiApiErrorCode;

  constructor(status: number, code: EnokiApiErrorCode, message: string) {
    super(message);
    this.name = "EnokiSubmitClientError";
    this.status = status;
    this.code = code;
  }
}

type SubmitPhotoDeps = {
  readonly fetchFn?: typeof fetch;
  readonly getJwt: () => Promise<string | null>;
  readonly signTransaction: (
    transactionBytes: string,
  ) => Promise<{ readonly signature: string }>;
};

export async function submitPhotoWithEnoki(
  input: {
    readonly unitId: string;
    readonly blobId: string;
  },
  deps: SubmitPhotoDeps,
): Promise<SubmitPhotoSuccess> {
  const jwt = await deps.getJwt();

  if (!jwt) {
    throw new EnokiSubmitClientError(
      401,
      "auth_expired",
      "ログインが切れました。Google でもう一度ログインしてください。",
    );
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const sponsor = await postJson<SponsorSubmitPhotoResponse>(
    fetchFn,
    "/api/enoki/submit-photo/sponsor",
    jwt,
    input,
  );
  const signed = await deps.signTransaction(sponsor.bytes);
  const executed = await postJson<ExecuteSponsoredResponse>(
    fetchFn,
    "/api/enoki/submit-photo/execute",
    jwt,
    {
      digest: sponsor.digest,
      signature: signed.signature,
    },
  );

  return {
    digest: executed.digest,
    sender: sponsor.sender,
  };
}

export function useSubmitPhoto(unitId: string): {
  readonly isSubmitting: boolean;
  readonly submitPhoto: (blobId: string) => Promise<SubmitPhotoSuccess>;
} {
  const currentWallet = useCurrentWallet();
  const signTransaction = useSignTransaction();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return {
    isSubmitting: isSubmitting || signTransaction.isPending,
    submitPhoto: async (blobId: string) => {
      setIsSubmitting(true);

      try {
        return await submitPhotoWithEnoki(
          {
            unitId,
            blobId,
          },
          {
            getJwt: async () => {
              if (!currentWallet.isConnected || !currentWallet.currentWallet) {
                return null;
              }

              const session = await getSession(currentWallet.currentWallet);
              return session?.jwt?.trim() ?? null;
            },
            signTransaction: async (transactionBytes) => {
              const signed = await signTransaction.mutateAsync({
                transaction: transactionBytes,
              });

              return {
                signature: signed.signature,
              };
            },
          },
        );
      } finally {
        setIsSubmitting(false);
      }
    },
  };
}

async function postJson<T>(
  fetchFn: typeof fetch,
  url: string,
  jwt: string,
  body: Record<string, string>,
): Promise<T> {
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [ENOKI_JWT_HEADER]: jwt,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw toClientError(response.status, payload);
  }

  return payload as T;
}

function toClientError(
  status: number,
  payload: unknown,
): EnokiSubmitClientError {
  if (
    payload &&
    typeof payload === "object" &&
    "code" in payload &&
    "message" in payload &&
    typeof payload.code === "string" &&
    typeof payload.message === "string" &&
    isEnokiApiErrorCode(payload.code)
  ) {
    return new EnokiSubmitClientError(status, payload.code, payload.message);
  }

  return new EnokiSubmitClientError(
    status,
    "sponsor_failed",
    "投稿の準備に失敗しました。時間をおいて、もう一度お試しください。",
  );
}

function isEnokiApiErrorCode(value: string): value is EnokiApiErrorCode {
  return (
    value === "auth_expired" ||
    value === "invalid_args" ||
    value === "sponsor_failed" ||
    value === "submit_unavailable"
  );
}

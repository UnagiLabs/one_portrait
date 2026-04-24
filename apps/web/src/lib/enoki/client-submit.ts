"use client";

import {
  useCurrentAccount,
  useCurrentWallet,
  useSignTransaction,
} from "@mysten/dapp-kit";
import { getSession, isGoogleWallet } from "@mysten/enoki";
import { useState } from "react";

import { ENOKI_JWT_HEADER, type EnokiApiErrorCode } from "./api";

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

export type SubmitPhotoFailureStatus = "recovering" | "failed";

export type SubmitPhotoRecoveryContext = {
  readonly digest: string;
  readonly sender: string;
  readonly blobId: string;
};

type EnokiSubmitClientErrorOptions = {
  readonly submissionStatus?: SubmitPhotoFailureStatus;
  readonly recovery?: SubmitPhotoRecoveryContext | null;
};

export class EnokiSubmitClientError extends Error {
  readonly status: number;
  readonly code: EnokiApiErrorCode;
  readonly submissionStatus: SubmitPhotoFailureStatus;
  readonly recovery: SubmitPhotoRecoveryContext | null;

  constructor(
    status: number,
    code: EnokiApiErrorCode,
    message: string,
    options: EnokiSubmitClientErrorOptions = {},
  ) {
    super(message);
    this.name = "EnokiSubmitClientError";
    this.status = status;
    this.code = code;
    this.submissionStatus = options.submissionStatus ?? "failed";
    this.recovery = options.recovery ?? null;
  }
}

type SubmitPhotoDeps = {
  readonly fetchFn?: typeof fetch;
  readonly getAuth: () => Promise<
    | { readonly kind: "jwt"; readonly jwt: string }
    | { readonly kind: "sender"; readonly sender: string }
    | null
  >;
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
  const auth = await deps.getAuth();

  if (!auth) {
    throw new EnokiSubmitClientError(
      401,
      "auth_expired",
      "Your login expired. Please sign in with Google again.",
    );
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const sponsor = await postJson<SponsorSubmitPhotoResponse>(
    fetchFn,
    "/api/enoki/submit-photo/sponsor",
    auth,
    input,
  );
  const signed = await deps.signTransaction(sponsor.bytes);
  let executed: ExecuteSponsoredResponse;

  try {
    executed = await postJson<ExecuteSponsoredResponse>(
      fetchFn,
      "/api/enoki/submit-photo/execute",
      auth,
      {
        digest: sponsor.digest,
        signature: signed.signature,
      },
    );
  } catch (error) {
    throw toExecuteSubmitError(error, {
      digest: sponsor.digest,
      sender: sponsor.sender,
      blobId: input.blobId,
    });
  }

  return {
    digest: executed.digest,
    sender: sponsor.sender,
  };
}

export function useSubmitPhoto(unitId: string): {
  readonly isSubmitting: boolean;
  readonly submitPhoto: (blobId: string) => Promise<SubmitPhotoSuccess>;
} {
  const currentAccount = useCurrentAccount();
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
            getAuth: async () => {
              if (
                !currentWallet.isConnected ||
                !currentWallet.currentWallet ||
                !currentAccount?.address
              ) {
                return null;
              }

              if (isGoogleWallet(currentWallet.currentWallet)) {
                const session = await getSession(currentWallet.currentWallet);
                const jwt = session?.jwt?.trim() ?? null;
                return jwt ? { kind: "jwt", jwt } : null;
              }

              return {
                kind: "sender",
                sender: currentAccount.address,
              };
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
  auth:
    | { readonly kind: "jwt"; readonly jwt: string }
    | { readonly kind: "sender"; readonly sender: string },
  body: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const requestBody =
    auth.kind === "sender" ? { ...body, sender: auth.sender } : body;

  if (auth.kind === "jwt") {
    headers[ENOKI_JWT_HEADER] = auth.jwt;
  }

  const response = await fetchFn(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
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
    "Could not prepare the submission. Please wait a moment and try again.",
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

function toExecuteSubmitError(
  error: unknown,
  recovery: SubmitPhotoRecoveryContext,
): EnokiSubmitClientError {
  if (error instanceof EnokiSubmitClientError) {
    if (
      error.code === "auth_expired" ||
      error.code === "invalid_args" ||
      error.code === "submit_unavailable" ||
      error.status < 500
    ) {
      return error;
    }

    return new EnokiSubmitClientError(error.status, error.code, error.message, {
      submissionStatus: "recovering",
      recovery,
    });
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return new EnokiSubmitClientError(502, "sponsor_failed", error.message, {
      submissionStatus: "recovering",
      recovery,
    });
  }

  return new EnokiSubmitClientError(
    502,
    "sponsor_failed",
    "Checking the submission result. Please wait a moment and check again.",
    {
      submissionStatus: "recovering",
      recovery,
    },
  );
}

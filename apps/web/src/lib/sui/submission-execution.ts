import type { SuiTransactionReadClient } from "./client";
import {
  type FindKakeraForSubmissionArgs,
  findKakeraForSubmission,
  type KakeraOwnedClient,
  type OwnedKakera,
} from "./kakera";

export type SubmissionExecutionReadClient = SuiTransactionReadClient &
  KakeraOwnedClient;

export type SubmissionExecutionStatus = "success" | "recovering" | "failed";

export type SubmissionExecutionResult = {
  readonly status: SubmissionExecutionStatus;
  readonly kakera: OwnedKakera | null;
};

export type CheckSubmissionExecutionArgs = FindKakeraForSubmissionArgs & {
  readonly suiClient: SubmissionExecutionReadClient;
  readonly digest: string;
};

export async function checkSubmissionExecution(
  args: CheckSubmissionExecutionArgs,
): Promise<SubmissionExecutionResult> {
  const digestStatus = await getDigestExecutionStatus(args);

  if (digestStatus === "success") {
    return { status: "success", kakera: null };
  }

  if (digestStatus === "failed") {
    return { status: "failed", kakera: null };
  }

  try {
    const kakera = await findKakeraForSubmission(args);
    if (kakera) {
      return { status: "success", kakera };
    }
  } catch {
    return { status: "recovering", kakera: null };
  }

  return { status: "recovering", kakera: null };
}

type DigestExecutionStatus = "success" | "failed" | "unknown";

async function getDigestExecutionStatus(
  args: CheckSubmissionExecutionArgs,
): Promise<DigestExecutionStatus> {
  try {
    const response = await args.suiClient.getTransactionBlock({
      digest: args.digest,
      options: {
        showEffects: true,
      },
    });

    return parseDigestExecutionStatus(response);
  } catch {
    return "unknown";
  }
}

function parseDigestExecutionStatus(response: unknown): DigestExecutionStatus {
  if (typeof response !== "object" || response === null) {
    return "unknown";
  }

  const effects = (response as { effects?: unknown }).effects;
  if (typeof effects !== "object" || effects === null) {
    return "unknown";
  }

  const status = (effects as { status?: unknown }).status;
  if (typeof status !== "object" || status === null) {
    return "unknown";
  }

  const executionStatus = (status as { status?: unknown }).status;
  if (executionStatus === "success") {
    return "success";
  }
  if (executionStatus === "failure") {
    return "failed";
  }

  return "unknown";
}

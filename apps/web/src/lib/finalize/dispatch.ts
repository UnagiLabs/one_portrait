export type FinalizeDispatchRequest = {
  readonly unitId: string;
};

export type FinalizeDispatchResult = {
  readonly accepted: boolean;
};

export async function dispatchFinalize(
  _request: FinalizeDispatchRequest,
): Promise<FinalizeDispatchResult> {
  throw new Error("Finalize dispatch is not configured yet.");
}

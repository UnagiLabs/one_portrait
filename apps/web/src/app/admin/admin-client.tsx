"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

import type { AdminHealthSummary } from "../../lib/admin/health";
import { preprocessPhoto } from "../../lib/image/preprocess";
import { type AdminUnitSnapshot } from "../../lib/sui";
import { putTargetBlobToWalrus } from "../../lib/walrus/put-target";

export type AdminAthleteEntry = {
  readonly athletePublicId: string;
  readonly currentUnit: AdminUnitSnapshot | null;
  readonly displayName: string;
  readonly lookupState: "missing" | "ready" | "unavailable";
  readonly slug: string;
  readonly thumbnailUrl: string;
};

type ActionResult = {
  readonly detail: string;
  readonly summary: string;
};

type AdminClientProps = {
  readonly initialAthletes: readonly AdminAthleteEntry[];
  readonly initialHealth: AdminHealthSummary;
};

export function AdminClient({
  initialAthletes,
  initialHealth,
}: AdminClientProps): React.ReactElement {
  const [athletes, setAthletes] = useState(initialAthletes);
  const [health, setHealth] = useState(initialHealth);
  const [selectedAthleteId, setSelectedAthleteId] = useState(
    initialAthletes[0]?.athletePublicId ?? "",
  );
  const [maxSlots, setMaxSlots] = useState("980");
  const [targetBlobId, setTargetBlobId] = useState("");
  const [targetPreviewUrl, setTargetPreviewUrl] = useState<string | null>(null);
  const [rotateAthleteId, setRotateAthleteId] = useState(
    initialAthletes[0]?.athletePublicId ?? "",
  );
  const [rotateUnitId, setRotateUnitId] = useState("");
  const [lastAction, setLastAction] = useState<ActionResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function refreshAll(): Promise<void> {
    setIsRefreshing(true);

    try {
      const [statusResponse, healthResponse] = await Promise.all([
        fetch("/api/admin/status"),
        fetch("/api/admin/health"),
      ]);

      const [statusPayload, healthPayload] = await Promise.all([
        statusResponse.json(),
        healthResponse.json(),
      ]);

      if (statusResponse.ok && Array.isArray(statusPayload.athletes)) {
        setAthletes(statusPayload.athletes);
      }

      if (healthResponse.ok) {
        setHealth(healthPayload);
      }
    } catch (error) {
      setLastAction({
        detail: error instanceof Error ? error.message : String(error),
        summary: "Refresh failed",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleTargetUpload(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);

    try {
      const preprocessed = await preprocessPhoto(file);
      setTargetPreviewUrl(preprocessed.previewUrl);

      const uploaded = await putTargetBlobToWalrus(preprocessed, {
        env: {
          NEXT_PUBLIC_WALRUS_AGGREGATOR:
            process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR,
          NEXT_PUBLIC_WALRUS_PUBLISHER: process.env.NEXT_PUBLIC_WALRUS_PUBLISHER,
        },
      });

      setTargetBlobId(uploaded.blobId);
      setLastAction({
        detail: uploaded.blobId,
        summary: "Target uploaded",
      });
    } catch (error) {
      setLastAction({
        detail: error instanceof Error ? error.message : String(error),
        summary: "Target upload failed",
      });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleCreateUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("create");

    try {
      const payload = await postJson("/api/admin/create-unit", {
        athleteId: Number(selectedAthleteId),
        blobId: targetBlobId,
        maxSlots: Number(maxSlots),
      });

      setRotateAthleteId(selectedAthleteId);
      if (typeof payload.unitId === "string") {
        setRotateUnitId(payload.unitId);
      }

      setLastAction({
        detail: formatActionDetail(payload),
        summary: "Create unit completed",
      });
      await refreshAll();
    } catch (error) {
      setLastAction({
        detail: error instanceof Error ? error.message : String(error),
        summary: "Create unit failed",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRotateUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("rotate");

    try {
      const payload = await postJson("/api/admin/rotate-unit", {
        athleteId: Number(rotateAthleteId),
        unitId: rotateUnitId,
      });

      setLastAction({
        detail: formatActionDetail(payload),
        summary: "Rotate unit completed",
      });
      await refreshAll();
    } catch (error) {
      setLastAction({
        detail: error instanceof Error ? error.message : String(error),
        summary: "Rotate unit failed",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleFinalize(unitId: string): Promise<void> {
    setPendingAction(`finalize:${unitId}`);

    try {
      const payload = await postJson("/api/admin/finalize", { unitId });

      setLastAction({
        detail: formatActionDetail(payload),
        summary: "Finalize retry completed",
      });
      await refreshAll();
    } catch (error) {
      setLastAction({
        detail: error instanceof Error ? error.message : String(error),
        summary: "Finalize retry failed",
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full border border-amber-200/40 bg-amber-300 px-5 py-2 text-sm font-medium text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isRefreshing}
          onClick={() => void refreshAll()}
          type="button"
        >
          {isRefreshing ? "Refreshing..." : "Refresh status"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <HealthCard
          label="Generator readiness"
          value={health.generatorReadiness.status}
        />
        <HealthCard
          label="Dispatch authorization"
          value={health.dispatchAuthorization.status}
        />
      </div>

      {lastAction ? (
        <section className="grid gap-2 rounded-[1.5rem] border border-emerald-200/20 bg-emerald-300/10 p-5">
          <h2 className="text-sm uppercase tracking-[0.25em] text-emerald-200/80">
            Last action
          </h2>
          <p className="text-xl font-semibold text-white">{lastAction.summary}</p>
          <p className="text-sm leading-6 text-stone-200">{lastAction.detail}</p>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-stone-950/60 p-6">
          <div className="grid gap-1">
            <h2 className="font-serif text-2xl text-white">
              Create next unit
            </h2>
            <p className="text-sm leading-6 text-stone-300">
              Upload the target portrait, confirm the blob id, and create a new
              unit for the selected athlete.
            </p>
          </div>

          <form className="grid gap-4" onSubmit={(event) => void handleCreateUnit(event)}>
            <label className="grid gap-2 text-sm text-stone-200">
              Athlete
              <select
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                onChange={(event) => setSelectedAthleteId(event.target.value)}
                value={selectedAthleteId}
              >
                {athletes.map((athlete) => (
                  <option
                    key={athlete.athletePublicId}
                    value={athlete.athletePublicId}
                  >
                    {athlete.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-stone-200">
              Target image
              <input
                accept="image/*"
                className="rounded-2xl border border-dashed border-white/20 bg-stone-900 px-4 py-3"
                onChange={(event) => void handleTargetUpload(event)}
                type="file"
              />
            </label>

            {targetPreviewUrl ? (
              // biome-ignore lint/performance/noImgElement: operator preview
              <img
                alt="Uploaded target preview"
                className="h-48 w-full rounded-2xl border border-white/10 object-cover"
                src={targetPreviewUrl}
              />
            ) : null}

            <label className="grid gap-2 text-sm text-stone-200">
              Target blob id
              <input
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3 font-mono text-xs"
                onChange={(event) => setTargetBlobId(event.target.value)}
                placeholder="Upload first or paste a blob id manually"
                value={targetBlobId}
              />
            </label>

            <label className="grid gap-2 text-sm text-stone-200">
              Max slots
              <input
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                inputMode="numeric"
                onChange={(event) => setMaxSlots(event.target.value)}
                value={maxSlots}
              />
            </label>

            <button
              className="rounded-full border border-amber-200/40 bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                isUploading ||
                pendingAction === "create" ||
                selectedAthleteId.length === 0 ||
                targetBlobId.trim().length === 0
              }
              type="submit"
            >
              {isUploading
                ? "Uploading target..."
                : pendingAction === "create"
                  ? "Creating..."
                  : "Create unit"}
            </button>
          </form>
        </section>

        <section className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-stone-950/60 p-6">
          <div className="grid gap-1">
            <h2 className="font-serif text-2xl text-white">Rotate current unit</h2>
            <p className="text-sm leading-6 text-stone-300">
              Switch the active unit for the selected athlete. The last created
              unit id is copied here automatically.
            </p>
          </div>

          <form className="grid gap-4" onSubmit={(event) => void handleRotateUnit(event)}>
            <label className="grid gap-2 text-sm text-stone-200">
              Athlete
              <select
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                onChange={(event) => setRotateAthleteId(event.target.value)}
                value={rotateAthleteId}
              >
                {athletes.map((athlete) => (
                  <option
                    key={athlete.athletePublicId}
                    value={athlete.athletePublicId}
                  >
                    {athlete.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-stone-200">
              Next unit id
              <input
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3 font-mono text-xs"
                onChange={(event) => setRotateUnitId(event.target.value)}
                placeholder="0x..."
                value={rotateUnitId}
              />
            </label>

            <button
              className="rounded-full border border-white/15 bg-white/90 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                pendingAction === "rotate" ||
                rotateAthleteId.length === 0 ||
                rotateUnitId.trim().length === 0
              }
              type="submit"
            >
              {pendingAction === "rotate" ? "Rotating..." : "Rotate current unit"}
            </button>
          </form>
        </section>
      </div>

      <section className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="font-serif text-2xl text-white">Current unit status</h2>
          <p className="text-sm leading-6 text-stone-300">
            Check the live unit state for each athlete and retry finalize when a
            filled unit stalls.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {athletes.map((athlete) => (
            <AdminAthleteCard
              athlete={athlete}
              key={athlete.athletePublicId}
              onFinalize={handleFinalize}
              pendingAction={pendingAction}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

function HealthCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.ReactElement {
  return (
    <article className="grid gap-2 rounded-[1.5rem] border border-white/10 bg-white/6 p-5">
      <p className="text-xs uppercase tracking-[0.25em] text-stone-300">
        {label}
      </p>
      <p className="font-serif text-3xl capitalize text-white">{value}</p>
    </article>
  );
}

function InfoRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.ReactElement {
  return (
    <div className="grid gap-1">
      <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">
        {label}
      </dt>
      <dd className="font-mono text-xs leading-5 text-stone-200 break-all">
        {value}
      </dd>
    </div>
  );
}

function AdminAthleteCard({
  athlete,
  onFinalize,
  pendingAction,
}: {
  readonly athlete: AdminAthleteEntry;
  readonly onFinalize: (unitId: string) => Promise<void>;
  readonly pendingAction: string | null;
}): React.ReactElement {
  const currentUnit = athlete.currentUnit;

  return (
    <article className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-stone-950/60 p-5">
      <div className="flex items-center gap-3">
        {/* biome-ignore lint/performance/noImgElement: operator card */}
        <img
          alt={athlete.displayName}
          className="h-14 w-14 rounded-2xl border border-white/10 object-cover"
          src={athlete.thumbnailUrl}
        />
        <div className="grid gap-1">
          <h3 className="font-semibold text-white">{athlete.displayName}</h3>
          <p className="font-mono text-xs text-stone-400">{athlete.slug}</p>
        </div>
      </div>

      {currentUnit ? (
        <>
          <dl className="grid gap-2 text-sm text-stone-200">
            <InfoRow label="Unit id" value={currentUnit.unitId} />
            <InfoRow
              label="Progress"
              value={`${currentUnit.submittedCount} / ${currentUnit.maxSlots}`}
            />
            <InfoRow label="Status" value={currentUnit.status} />
            <InfoRow label="Target blob" value={currentUnit.targetWalrusBlobId} />
          </dl>
          <button
            className="rounded-full border border-emerald-200/30 bg-emerald-300/20 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pendingAction === `finalize:${currentUnit.unitId}`}
            onClick={() => void onFinalize(currentUnit.unitId)}
            type="button"
          >
            {pendingAction === `finalize:${currentUnit.unitId}`
              ? "Retrying..."
              : "Retry finalize"}
          </button>
        </>
      ) : (
        <p className="text-sm leading-6 text-stone-300">
          {athlete.lookupState === "missing"
            ? "No current unit is registered for this athlete yet."
            : "Current unit state is temporarily unavailable."}
        </p>
      )}
    </article>
  );
}

async function postJson(
  url: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  const json = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      typeof json.message === "string" ? json.message : "Request failed.",
    );
  }

  return json;
}

function formatActionDetail(payload: Record<string, unknown>): string {
  const parts = [
    typeof payload.status === "string" ? `status: ${payload.status}` : null,
    typeof payload.digest === "string" ? `digest: ${payload.digest}` : null,
    typeof payload.unitId === "string" ? `unitId: ${payload.unitId}` : null,
    typeof payload.mosaicBlobId === "string"
      ? `mosaicBlobId: ${payload.mosaicBlobId}`
      : null,
  ].filter((value): value is string => value !== null);

  return parts.join(" / ");
}

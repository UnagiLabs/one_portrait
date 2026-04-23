"use client";

import { unitTileCount } from "@one-portrait/shared";
import { type ChangeEvent, type FormEvent, useState } from "react";

import type { AdminAthleteEntry } from "../../lib/admin/athletes";
import type { AdminHealthSummary } from "../../lib/admin/health";
import { preprocessPhoto } from "../../lib/image/preprocess";
import { putTargetBlobToWalrus } from "../../lib/walrus/put-target";

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
  const [metadataAthleteId, setMetadataAthleteId] = useState(
    initialAthletes[0]?.athletePublicId ?? "",
  );
  const [metadataDisplayName, setMetadataDisplayName] = useState(
    initialAthletes[0]?.metadataState === "ready"
      ? initialAthletes[0].displayName
      : "",
  );
  const [metadataSlug, setMetadataSlug] = useState(
    initialAthletes[0]?.metadataState === "ready"
      ? initialAthletes[0].slug
      : "",
  );
  const [metadataThumbnailUrl, setMetadataThumbnailUrl] = useState(
    initialAthletes[0]?.metadataState === "ready"
      ? initialAthletes[0].thumbnailUrl
      : "",
  );
  const [selectedAthleteId, setSelectedAthleteId] = useState(
    initialAthletes[0]?.athletePublicId ?? "",
  );
  const [maxSlots, setMaxSlots] = useState(String(unitTileCount));
  const [isDemoUnit, setIsDemoUnit] = useState(false);
  const [remainingSlots, setRemainingSlots] = useState("5");
  const [displayMaxSlots, setDisplayMaxSlots] = useState(String(unitTileCount));
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
        summary: "状態の更新に失敗しました",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  function loadMetadataDraft(athleteId: string): void {
    const athlete = athletes.find(
      (entry) => entry.athletePublicId === athleteId,
    );
    setMetadataAthleteId(athleteId);
    setMetadataDisplayName(
      athlete?.metadataState === "ready" ? athlete.displayName : "",
    );
    setMetadataSlug(athlete?.metadataState === "ready" ? athlete.slug : "");
    setMetadataThumbnailUrl(
      athlete?.metadataState === "ready" ? athlete.thumbnailUrl : "",
    );
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
          NEXT_PUBLIC_WALRUS_PUBLISHER:
            process.env.NEXT_PUBLIC_WALRUS_PUBLISHER,
        },
      });

      setTargetBlobId(uploaded.blobId);
      setLastAction({
        detail: uploaded.blobId,
        summary: "対象画像をアップロードしました",
      });
    } catch (error) {
      setLastAction({
        detail: error instanceof Error ? error.message : String(error),
        summary: "対象画像のアップロードに失敗しました",
      });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleMetadataSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("metadata");

    try {
      const payload = await postJson("/api/admin/upsert-athlete-metadata", {
        athleteId: Number(metadataAthleteId),
        displayName: metadataDisplayName,
        slug: metadataSlug,
        thumbnailUrl: metadataThumbnailUrl,
      });

      if (!selectedAthleteId) {
        setSelectedAthleteId(metadataAthleteId);
      }
      if (!rotateAthleteId) {
        setRotateAthleteId(metadataAthleteId);
      }

      setLastAction({
        detail: formatActionDetail(payload),
        summary: "athlete metadata を更新しました",
      });
      await refreshAll();
    } catch (error) {
      setLastAction({
        detail: error instanceof Error ? error.message : String(error),
        summary: "athlete metadata の更新に失敗しました",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCreateUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("create");

    try {
      const payload = await postJson(
        "/api/admin/create-unit",
        buildCreateUnitPayload({
          athleteId: Number(selectedAthleteId),
          blobId: targetBlobId,
          displayMaxSlots: Number(displayMaxSlots),
          isDemoUnit,
          maxSlots: Number(maxSlots),
          remainingSlots: Number(remainingSlots),
        }),
      );

      setRotateAthleteId(selectedAthleteId);
      if (typeof payload.unitId === "string") {
        setRotateUnitId(payload.unitId);
      }

      setLastAction({
        detail: formatActionDetail(payload),
        summary: "ユニットを作成しました",
      });
      await refreshAll();
    } catch (error) {
      setLastAction({
        detail: error instanceof Error ? error.message : String(error),
        summary: "ユニットの作成に失敗しました",
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
        summary: "ユニットを切り替えました",
      });
      await refreshAll();
    } catch (error) {
      setLastAction({
        detail: error instanceof Error ? error.message : String(error),
        summary: "ユニットの切り替えに失敗しました",
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
        summary: "finalize を再試行しました",
      });
      await refreshAll();
    } catch (error) {
      setLastAction({
        detail: error instanceof Error ? error.message : String(error),
        summary: "finalize の再試行に失敗しました",
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
          {isRefreshing ? "更新中..." : "状態を更新"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <HealthCard
          label="ジェネレーター準備状態"
          value={health.generatorReadiness.status}
        />
        <HealthCard
          label="ディスパッチ認可"
          value={health.dispatchAuthorization.status}
        />
      </div>

      <section className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-white/6 p-5">
        <h2 className="text-xs uppercase tracking-[0.25em] text-stone-300">
          現在の generator 接続先
        </h2>
        <dl className="grid gap-3 md:grid-cols-3">
          <InfoRow
            label="current URL"
            value={health.currentUrl ?? "not resolved"}
          />
          <InfoRow label="source" value={health.source} />
          <InfoRow label="resolution" value={health.resolutionStatus} />
        </dl>
      </section>

      {lastAction ? (
        <section className="grid gap-2 rounded-[1.5rem] border border-emerald-200/20 bg-emerald-300/10 p-5">
          <h2 className="text-sm uppercase tracking-[0.25em] text-emerald-200/80">
            直近の操作
          </h2>
          <p className="text-xl font-semibold text-white">
            {lastAction.summary}
          </p>
          <p className="text-sm leading-6 text-stone-200">
            {lastAction.detail}
          </p>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-stone-950/60 p-6">
          <div className="grid gap-1">
            <h2 className="font-serif text-2xl text-white">
              athlete metadata を登録
            </h2>
            <p className="text-sm leading-6 text-stone-300">
              先に displayName、slug、thumbnail URL を on-chain 登録します。
              unit 作成前の必須ステップです。
            </p>
          </div>

          {athletes.length > 0 ? (
            <label className="grid gap-2 text-sm text-stone-200">
              既存 athlete から読み込む
              <select
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                onChange={(event) => loadMetadataDraft(event.target.value)}
                value={metadataAthleteId}
              >
                {athletes.map((athlete) => (
                  <option
                    key={athlete.athletePublicId}
                    value={athlete.athletePublicId}
                  >
                    #{athlete.athletePublicId} {athlete.displayName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <form
            className="grid gap-4"
            onSubmit={(event) => void handleMetadataSubmit(event)}
          >
            <label className="grid gap-2 text-sm text-stone-200">
              athlete ID
              <input
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                inputMode="numeric"
                onChange={(event) => setMetadataAthleteId(event.target.value)}
                placeholder="例: 7"
                value={metadataAthleteId}
              />
            </label>

            <label className="grid gap-2 text-sm text-stone-200">
              displayName
              <input
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                onChange={(event) => setMetadataDisplayName(event.target.value)}
                placeholder="Demo Athlete Seven"
                value={metadataDisplayName}
              />
            </label>

            <label className="grid gap-2 text-sm text-stone-200">
              slug
              <input
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3 font-mono text-xs"
                onChange={(event) => setMetadataSlug(event.target.value)}
                placeholder="demo-athlete-seven"
                value={metadataSlug}
              />
            </label>

            <label className="grid gap-2 text-sm text-stone-200">
              thumbnail URL
              <input
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3 font-mono text-xs"
                onChange={(event) =>
                  setMetadataThumbnailUrl(event.target.value)
                }
                placeholder="https://example.com/7.png"
                value={metadataThumbnailUrl}
              />
            </label>

            <button
              className="rounded-full border border-cyan-200/40 bg-cyan-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                pendingAction === "metadata" ||
                metadataAthleteId.trim().length === 0 ||
                metadataDisplayName.trim().length === 0 ||
                metadataSlug.trim().length === 0 ||
                metadataThumbnailUrl.trim().length === 0
              }
              type="submit"
            >
              {pendingAction === "metadata"
                ? "更新中..."
                : "metadata を登録 / 更新"}
            </button>
          </form>
        </section>

        <section className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-stone-950/60 p-6">
          <div className="grid gap-1">
            <h2 className="font-serif text-2xl text-white">ユニットを作成</h2>
            <p className="text-sm leading-6 text-stone-300">
              metadata 登録済みの athlete ID を指定して、新しい unit
              を作成します。
            </p>
          </div>

          <form
            className="grid gap-4"
            onSubmit={(event) => void handleCreateUnit(event)}
          >
            <label className="grid gap-2 text-sm text-stone-200">
              athlete ID
              <input
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                inputMode="numeric"
                onChange={(event) => setSelectedAthleteId(event.target.value)}
                placeholder="例: 7"
                value={selectedAthleteId}
              />
            </label>

            <label className="grid gap-2 text-sm text-stone-200">
              対象画像
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
                alt="アップロードした対象画像のプレビュー"
                className="h-48 w-full rounded-2xl border border-white/10 object-cover"
                src={targetPreviewUrl}
              />
            ) : null}

            <label className="grid gap-2 text-sm text-stone-200">
              対象 blob ID
              <input
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3 font-mono text-xs"
                onChange={(event) => setTargetBlobId(event.target.value)}
                placeholder="先にアップロードするか、blob ID を直接入力してください"
                value={targetBlobId}
              />
            </label>

            <label className="grid gap-2 text-sm text-stone-200">
              <span className="flex items-center gap-2">
                <input
                  checked={isDemoUnit}
                  className="accent-amber-300"
                  onChange={(event) => setIsDemoUnit(event.target.checked)}
                  type="checkbox"
                />
                demo unit として作成
              </span>
            </label>

            {isDemoUnit ? (
              <>
                <label className="grid gap-2 text-sm text-stone-200">
                  実際に集める残り枚数
                  <input
                    className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                    inputMode="numeric"
                    onChange={(event) => setRemainingSlots(event.target.value)}
                    value={remainingSlots}
                  />
                </label>

                <label className="grid gap-2 text-sm text-stone-200">
                  画面に見せる総数
                  <input
                    className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                    inputMode="numeric"
                    onChange={(event) => setDisplayMaxSlots(event.target.value)}
                    value={displayMaxSlots}
                  />
                </label>
              </>
            ) : (
              <label className="grid gap-2 text-sm text-stone-200">
                最大スロット数
                <input
                  className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                  inputMode="numeric"
                  onChange={(event) => setMaxSlots(event.target.value)}
                  value={maxSlots}
                />
              </label>
            )}

            <button
              className="rounded-full border border-amber-200/40 bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                isUploading ||
                pendingAction === "create" ||
                selectedAthleteId.trim().length === 0 ||
                targetBlobId.trim().length === 0 ||
                (isDemoUnit
                  ? remainingSlots.trim().length === 0 ||
                    displayMaxSlots.trim().length === 0
                  : maxSlots.trim().length === 0)
              }
              type="submit"
            >
              {isUploading
                ? "対象画像をアップロード中..."
                : pendingAction === "create"
                  ? "作成中..."
                  : "ユニットを作成"}
            </button>
          </form>
        </section>

        <section className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-stone-950/60 p-6">
          <div className="grid gap-1">
            <h2 className="font-serif text-2xl text-white">
              ユニットを切り替え
            </h2>
            <p className="text-sm leading-6 text-stone-300">
              athlete ID と next unit ID を指定して current unit を更新します。
            </p>
          </div>

          <form
            className="grid gap-4"
            onSubmit={(event) => void handleRotateUnit(event)}
          >
            <label className="grid gap-2 text-sm text-stone-200">
              athlete ID
              <input
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                inputMode="numeric"
                onChange={(event) => setRotateAthleteId(event.target.value)}
                placeholder="例: 7"
                value={rotateAthleteId}
              />
            </label>

            <label className="grid gap-2 text-sm text-stone-200">
              次のユニット ID
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
                rotateAthleteId.trim().length === 0 ||
                rotateUnitId.trim().length === 0
              }
              type="submit"
            >
              {pendingAction === "rotate"
                ? "切り替え中..."
                : "ユニットを切り替え"}
            </button>
          </form>
        </section>
      </div>

      <section className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="font-serif text-2xl text-white">現在の状態</h2>
          <p className="text-sm leading-6 text-stone-300">
            on-chain metadata と current unit の状態を確認し、filled のまま停止
            した unit で finalize を再試行できます。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {athletes.map((athlete) => (
            <AdminAthleteCard
              athlete={athlete}
              key={athlete.athletePublicId}
              onEditMetadata={loadMetadataDraft}
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
  onEditMetadata,
  onFinalize,
  pendingAction,
}: {
  readonly athlete: AdminAthleteEntry;
  readonly onEditMetadata: (athleteId: string) => void;
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

      <dl className="grid gap-2 text-sm text-stone-200">
        <InfoRow label="athlete ID" value={athlete.athletePublicId} />
        <InfoRow
          label="metadata"
          value={
            athlete.metadataState === "ready"
              ? "registered"
              : "missing / register before create-unit"
          }
        />
      </dl>

      <button
        className="rounded-full border border-cyan-200/30 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/20"
        onClick={() => onEditMetadata(athlete.athletePublicId)}
        type="button"
      >
        metadata フォームに反映
      </button>

      {currentUnit ? (
        <>
          <dl className="grid gap-2 text-sm text-stone-200">
            <InfoRow label="ユニット ID" value={currentUnit.unitId} />
            <InfoRow
              label="進行状況"
              value={formatAdminProgress(currentUnit)}
            />
            <InfoRow
              label="実残り"
              value={`${getRemainingSlotsCount(currentUnit)} 枚`}
            />
            <InfoRow label="ステータス" value={currentUnit.status} />
            <InfoRow label="対象 blob" value={currentUnit.targetWalrusBlobId} />
          </dl>
          <button
            className="rounded-full border border-emerald-200/30 bg-emerald-300/20 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pendingAction === `finalize:${currentUnit.unitId}`}
            onClick={() => void onFinalize(currentUnit.unitId)}
            type="button"
          >
            {pendingAction === `finalize:${currentUnit.unitId}`
              ? "再試行中..."
              : "finalize を再試行"}
          </button>
        </>
      ) : (
        <p className="text-sm leading-6 text-stone-300">
          {athlete.lookupState === "missing"
            ? "この athlete にはまだ current unit が登録されていません。"
            : "current unit の状態を一時的に取得できません。"}
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
      "x-one-portrait-admin-request": "same-origin",
    },
    method: "POST",
  });

  const json = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      typeof json.message === "string"
        ? json.message
        : "リクエストに失敗しました。",
    );
  }

  return json;
}

function formatActionDetail(payload: Record<string, unknown>): string {
  const parts = [
    typeof payload.status === "string" ? `ステータス: ${payload.status}` : null,
    typeof payload.digest === "string"
      ? `ダイジェスト: ${payload.digest}`
      : null,
    typeof payload.athleteId === "number"
      ? `athlete ID: ${payload.athleteId}`
      : null,
    typeof payload.unitId === "string" ? `ユニットID: ${payload.unitId}` : null,
    typeof payload.mosaicBlobId === "string"
      ? `モザイク Blob ID: ${payload.mosaicBlobId}`
      : null,
  ].filter((value): value is string => value !== null);

  return parts.join(" / ");
}

function buildCreateUnitPayload(input: {
  readonly athleteId: number;
  readonly blobId: string;
  readonly displayMaxSlots: number;
  readonly isDemoUnit: boolean;
  readonly maxSlots: number;
  readonly remainingSlots: number;
}) {
  if (input.isDemoUnit) {
    return {
      athleteId: input.athleteId,
      blobId: input.blobId,
      displayMaxSlots: input.displayMaxSlots,
      maxSlots: input.remainingSlots,
    };
  }

  return {
    athleteId: input.athleteId,
    blobId: input.blobId,
    displayMaxSlots: input.maxSlots,
    maxSlots: input.maxSlots,
  };
}

function formatAdminProgress(
  unit: AdminAthleteEntry["currentUnit"] &
    NonNullable<AdminAthleteEntry["currentUnit"]>,
): string {
  return `${getDisplayedSubmittedCount(unit)} / ${unit.displayMaxSlots}`;
}

function getDisplayedSubmittedCount(
  unit: AdminAthleteEntry["currentUnit"] &
    NonNullable<AdminAthleteEntry["currentUnit"]>,
): number {
  return unit.displayMaxSlots - unit.maxSlots + unit.submittedCount;
}

function getRemainingSlotsCount(
  unit: AdminAthleteEntry["currentUnit"] &
    NonNullable<AdminAthleteEntry["currentUnit"]>,
): number {
  return Math.max(0, unit.maxSlots - unit.submittedCount);
}

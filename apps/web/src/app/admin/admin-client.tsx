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

type CreateUnitMode = "demo" | "normal";

const DEFAULT_DEMO_REAL_UPLOAD_COUNT = "5";

export function AdminClient({
  initialAthletes,
  initialHealth,
}: AdminClientProps): React.ReactElement {
  const [athletes, setAthletes] = useState(initialAthletes);
  const [health, setHealth] = useState(initialHealth);
  const [createDisplayName, setCreateDisplayName] = useState(
    initialAthletes[0]?.displayName ?? "",
  );
  const [createThumbnailUrl, setCreateThumbnailUrl] = useState(
    initialAthletes[0]?.thumbnailUrl ?? "",
  );
  const [createMode, setCreateMode] = useState<CreateUnitMode>("normal");
  const [createRealUploadCount, setCreateRealUploadCount] = useState(
    DEFAULT_DEMO_REAL_UPLOAD_COUNT,
  );
  const [targetBlobId, setTargetBlobId] = useState("");
  const [targetPreviewUrl, setTargetPreviewUrl] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<ActionResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const parsedDemoRealUploadCount = parsePositiveInteger(createRealUploadCount);
  const isDemoRealUploadCountValid =
    parsedDemoRealUploadCount !== null &&
    parsedDemoRealUploadCount < unitTileCount;
  const effectiveDisplayMaxSlots = unitTileCount;
  const effectiveMaxSlots =
    createMode === "demo"
      ? (parsedDemoRealUploadCount ?? 0)
      : effectiveDisplayMaxSlots;

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

  function loadCreateDraft(entryKey: string): void {
    const athlete = athletes.find(
      (entry) => (entry.entryId ?? entry.currentUnit?.unitId) === entryKey,
    );
    if (!athlete) {
      return;
    }

    setCreateDisplayName(athlete.displayName);
    setCreateThumbnailUrl(athlete.thumbnailUrl);

    if (
      athlete.currentUnit &&
      athlete.currentUnit.displayMaxSlots > athlete.currentUnit.maxSlots
    ) {
      setCreateMode("demo");
      setCreateRealUploadCount(String(athlete.currentUnit.maxSlots));
      return;
    }

    setCreateMode("normal");
    setCreateRealUploadCount(DEFAULT_DEMO_REAL_UPLOAD_COUNT);
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

  async function handleCreateUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("create");

    try {
      const payload = await postJson("/api/admin/create-unit", {
        blobId: targetBlobId,
        displayMaxSlots: effectiveDisplayMaxSlots,
        displayName: createDisplayName,
        maxSlots: effectiveMaxSlots,
        thumbnailUrl: createThumbnailUrl,
      });

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

      <section className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-stone-950/60 p-6">
        <div className="grid gap-1">
          <h2 className="font-serif text-2xl text-white">ユニットを作成</h2>
          <p className="text-sm leading-6 text-stone-300">
            選手表示情報と対象画像をまとめて登録し、新しい unit を作成します。
            デモでは表示 2,000 枚のまま、実投稿枚数だけを絞れます。
          </p>
        </div>

        {athletes.length > 0 ? (
          <label className="grid gap-2 text-sm text-stone-200">
            既存 unit から入力をコピー
            <select
              className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
              onChange={(event) => loadCreateDraft(event.target.value)}
              value=""
            >
              <option value="">選択してください</option>
              {athletes.map((athlete) => (
                <option
                  key={athlete.entryId ?? athlete.currentUnit?.unitId}
                  value={athlete.entryId ?? athlete.currentUnit?.unitId}
                >
                  {athlete.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <form
          className="grid gap-5"
          onSubmit={(event) => void handleCreateUnit(event)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-stone-200">
              displayName
              <input
                className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3"
                onChange={(event) => setCreateDisplayName(event.target.value)}
                placeholder="Demo Athlete Seven"
                value={createDisplayName}
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm text-stone-200">
            thumbnail URL
            <input
              className="rounded-2xl border border-white/10 bg-stone-900 px-4 py-3 font-mono text-xs"
              onChange={(event) => setCreateThumbnailUrl(event.target.value)}
              placeholder="https://example.com/7.png"
              value={createThumbnailUrl}
            />
          </label>

          <fieldset className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
            <legend className="px-2 text-sm font-medium text-stone-100">
              作成モード
            </legend>
            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-stone-900/70 p-4 text-sm text-stone-200">
              <input
                checked={createMode === "normal"}
                name="create-unit-mode"
                onChange={() => setCreateMode("normal")}
                type="radio"
              />
              <span className="grid gap-1">
                <span className="font-medium text-white">通常</span>
                <span>表示 2,000 枚 / 実投稿 2,000 枚で作成します。</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-stone-900/70 p-4 text-sm text-stone-200">
              <input
                checked={createMode === "demo"}
                name="create-unit-mode"
                onChange={() => setCreateMode("demo")}
                type="radio"
              />
              <span className="grid gap-2">
                <span className="font-medium text-white">デモ</span>
                <span>
                  表示は 2,000
                  枚のまま、実際にアップロードさせる枚数だけを指定します。
                </span>
                <label className="grid gap-2 text-sm text-stone-200">
                  実アップロード枚数
                  <input
                    aria-label="デモ実アップロード枚数"
                    className="rounded-2xl border border-white/10 bg-stone-950 px-4 py-3"
                    disabled={createMode !== "demo"}
                    inputMode="numeric"
                    onChange={(event) =>
                      setCreateRealUploadCount(event.target.value)
                    }
                    value={createRealUploadCount}
                  />
                </label>
              </span>
            </label>
            <p className="text-xs leading-6 text-stone-400">
              {createMode === "demo"
                ? isDemoRealUploadCountValid
                  ? `5 枚完了の時点で残り ${effectiveDisplayMaxSlots - effectiveMaxSlots} 枚をダミー画像としてロックし、実投稿分だけを元データとしてモザイク生成します。`.replace(
                      "5",
                      String(effectiveMaxSlots),
                    )
                  : `デモでは 1 以上 ${unitTileCount - 1} 以下の実アップロード枚数を指定してください。`
                : "通常では 2,000 枚すべてが実投稿対象です。"}
            </p>
          </fieldset>

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

          <dl className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-white/5 p-4 md:grid-cols-2">
            <InfoRow
              label="表示スロット"
              value={String(effectiveDisplayMaxSlots)}
            />
            <InfoRow label="実投稿上限" value={String(effectiveMaxSlots)} />
          </dl>

          <button
            className="rounded-full border border-amber-200/40 bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              isUploading ||
              pendingAction === "create" ||
              createDisplayName.trim().length === 0 ||
              createThumbnailUrl.trim().length === 0 ||
              targetBlobId.trim().length === 0 ||
              (createMode === "demo" && !isDemoRealUploadCountValid)
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

      <section className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="font-serif text-2xl text-white">現在の状態</h2>
          <p className="text-sm leading-6 text-stone-300">
            作成済み unit の表示進捗と実投稿数を確認し、filled のまま停止した
            unit で finalize を再試行できます。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {athletes.map((athlete) => (
            <AdminAthleteCard
              athlete={athlete}
              key={athlete.entryId ?? athlete.currentUnit?.unitId}
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
  const modeLabel =
    currentUnit && currentUnit.displayMaxSlots > currentUnit.maxSlots
      ? "demo"
      : "normal";

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
            <InfoRow label="ユニット ID" value={currentUnit.unitId} />
            <InfoRow
              label="表示進行"
              value={`${currentUnit.submittedCount} / ${currentUnit.displayMaxSlots}`}
            />
            <InfoRow
              label="実投稿数"
              value={`${currentUnit.realSubmittedCount} / ${currentUnit.maxSlots}`}
            />
            <InfoRow label="モード" value={modeLabel} />
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
          unit の状態を一時的に取得できません。
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
    typeof payload.unitId === "string" ? `ユニットID: ${payload.unitId}` : null,
    typeof payload.status === "string" ? `ステータス: ${payload.status}` : null,
    typeof payload.digest === "string"
      ? `ダイジェスト: ${payload.digest}`
      : null,
    typeof payload.mosaicBlobId === "string"
      ? `モザイク Blob ID: ${payload.mosaicBlobId}`
      : null,
  ].filter((value): value is string => value !== null);

  return parts.join(" / ");
}

function parsePositiveInteger(value: string): number | null {
  if (!/^[0-9]+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

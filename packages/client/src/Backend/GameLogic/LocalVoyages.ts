import { locationIdFromHexStr } from "@df/serde";
import type {
  LocationId,
  QueuedArrival,
  WorldCoords,
  WorldLocation,
} from "@df/types";
import {
  decodeValueArgs,
  getSchemaTypes,
  getValueSchema,
} from "@latticexyz/protocol-parser/internal";
import type { StorageAdapterBlock } from "@latticexyz/store-sync";
import mudConfig from "contracts/mud.config";

import type { ActionRecord } from "../Save/FileChunkSource";

const { Move } = mudConfig.namespaces.df.tables;
const moveSchema = getSchemaTypes(getValueSchema(Move));
const previewLifetimeMs = 30_000;
const maxRecentTransactions = 2048;
const maxHandoffs = 128;
const planetReference = String.raw`(\(\s*-?\d+\s*,\s*-?\d+\s*\)|(?:0x)?[0-9a-f]{64})`;
const sourceReference = new RegExp(
  String.raw`\bfrom\s+${planetReference}`,
  "i",
);
const destinationReference = new RegExp(
  String.raw`\bto\s+${planetReference}`,
  "i",
);

type PreviewContext = {
  getPlanetWithCoords(
    coords: WorldCoords,
  ): { locationId: LocationId } | undefined;
  getLocationOfPlanet(id: LocationId): WorldLocation | undefined;
  getTimeForMove(from: LocationId, to: LocationId): number;
};

type Preview = {
  from: WorldLocation;
  to: WorldLocation;
  energy: number;
  departureMs: number;
  arrivalMs: number;
  expiresMs: number;
  drawn?: boolean;
};

function getPlanetId(
  ref: unknown,
  context: PreviewContext,
): LocationId | undefined {
  let coords: WorldCoords | undefined;
  if (typeof ref === "string") {
    const value = ref.trim();
    if (/^(?:0x)?[0-9a-f]{64}$/i.test(value)) {
      try {
        return locationIdFromHexStr(value.toLowerCase());
      } catch {
        return undefined;
      }
    }
    const point = /^\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/.exec(value);
    if (point) coords = { x: Number(point[1]), y: Number(point[2]) };
  } else if (
    ref &&
    typeof ref === "object" &&
    "x" in ref &&
    "y" in ref &&
    typeof ref.x === "number" &&
    typeof ref.y === "number"
  ) {
    coords = { x: ref.x, y: ref.y };
  }
  if (
    coords &&
    Number.isSafeInteger(coords.x) &&
    Number.isSafeInteger(coords.y)
  ) {
    return context.getPlanetWithCoords(coords)?.locationId;
  }
}

function getMoveDetails(action: ActionRecord) {
  const detail = action.detail ?? "";
  if (detail.startsWith("{")) {
    try {
      const parsed = JSON.parse(detail) as {
        from?: unknown;
        to?: unknown;
        energy?: unknown;
        population?: unknown;
      };
      return {
        from: action.from ?? parsed.from,
        to: action.to ?? parsed.to,
        energy: parsed.energy ?? parsed.population,
      };
    } catch {
      // Old action logs can contain plain text instead.
    }
  }
  const energy = /\b([\d,]+(?:\.\d+)?)\s+energy\b/i.exec(detail)?.[1];
  return {
    from: action.from ?? sourceReference.exec(detail)?.[1],
    to: action.to ?? destinationReference.exec(detail)?.[1],
    energy: energy && Number(energy.replaceAll(",", "")),
  };
}

function getProgress(preview: Preview, now: number): number {
  return Math.max(
    0.01,
    Math.min(
      0.99,
      (now - preview.departureMs) / (preview.arrivalMs - preview.departureMs),
    ),
  );
}

export class LocalVoyages {
  private readonly confirmed = new Set<string>();
  private readonly previews = new Map<string, Preview>();
  private readonly handoffs = new Map<
    string,
    { localProgress: number; chainProgress?: number }
  >();

  public clearPreviews() {
    this.previews.clear();
    this.handoffs.clear();
  }

  public add(
    action: ActionRecord,
    context: PreviewContext,
    clockOffsetMs: number,
    now = Date.now(),
  ) {
    if (
      action.action !== "move" ||
      !action.tx ||
      !/^0x[0-9a-f]{64}$/i.test(action.tx)
    )
      return;
    const tx = action.tx.toLowerCase();
    if (this.confirmed.has(tx) || this.previews.has(tx)) return;
    const departure = Date.parse(action.time ?? "") - clockOffsetMs;
    if (
      !Number.isFinite(departure) ||
      Math.abs(now - departure) > previewLifetimeMs
    )
      return;

    const details = getMoveDetails(action);
    const fromId = getPlanetId(details.from, context);
    const toId = getPlanetId(details.to, context);
    if (!fromId || !toId || fromId === toId) return;
    const from = context.getLocationOfPlanet(fromId);
    const to = context.getLocationOfPlanet(toId);
    if (!from || !to) return;
    let duration: number;
    try {
      duration = context.getTimeForMove(fromId, toId) * 1000;
    } catch {
      return;
    }
    const departureMs = Math.min(now, departure);
    const arrivalMs = departureMs + duration;
    if (!Number.isFinite(arrivalMs) || arrivalMs <= now) return;
    const energy =
      typeof details.energy === "number" && Number.isFinite(details.energy)
        ? Math.max(0, details.energy)
        : 0;
    this.previews.set(tx, {
      from,
      to,
      energy,
      departureMs,
      arrivalMs,
      expiresMs: now + previewLifetimeMs,
    });
  }

  public confirmBlock({ logs }: StorageAdapterBlock, now = Date.now()) {
    for (const log of logs) {
      const tx = log.transactionHash?.toLowerCase();
      if (!tx || log.removed) continue;
      this.confirmed.add(tx);
      if (this.confirmed.size > maxRecentTransactions) {
        const oldest = this.confirmed.values().next();
        if (!oldest.done) this.confirmed.delete(oldest.value);
      }

      // Only transfer animation progress to the fleet from the same transaction and route.
      const preview = this.previews.get(tx);
      if (
        !preview?.drawn ||
        log.eventName !== "Store_SetRecord" ||
        log.args.tableId !== Move.tableId
      )
        continue;
      const { id, from } = decodeValueArgs(moveSchema, log.args);
      const to = locationIdFromHexStr(log.args.keyTuple[0]);
      if (
        preview.from.hash !== locationIdFromHexStr(from) ||
        preview.to.hash !== to
      )
        continue;
      this.handoffs.set(`${id}:${preview.from.hash}:${to}`, {
        localProgress: getProgress(preview, now),
      });
      if (this.handoffs.size > maxHandoffs) {
        const oldest = this.handoffs.keys().next();
        if (!oldest.done) this.handoffs.delete(oldest.value);
      }
    }
    for (const tx of this.previews.keys()) {
      if (this.confirmed.has(tx)) this.previews.delete(tx);
    }
  }

  public *getActive(now: number) {
    for (const [tx, preview] of this.previews) {
      if (now >= preview.expiresMs) {
        this.previews.delete(tx);
        continue;
      }
      if (now >= preview.arrivalMs) continue;
      preview.drawn = true;
      yield {
        from: preview.from.coords,
        to: preview.to.coords,
        energy: preview.energy,
        progress: getProgress(preview, now),
      };
    }
  }

  public getVisualProgress(voyage: QueuedArrival, progress: number): number {
    const key = `${voyage.eventId}:${voyage.fromPlanet}:${voyage.toPlanet}`;
    const handoff = this.handoffs.get(key);
    if (!handoff) return progress;
    handoff.chainProgress ??= progress;
    const remainingProgress = Math.max(
      0,
      (progress - handoff.chainProgress) / (1 - handoff.chainProgress),
    );
    return Math.min(
      0.99,
      handoff.localProgress + remainingProgress * (1 - handoff.localProgress),
    );
  }
}

import { describe, expect, it } from "vitest";

import { type ArrivalMemory, noteMyArrivals } from "./arrivalSound";

const ME = "0x2Ee03331a6e02c9F90E6D558Fd0e48e016746acc";

function memory(): ArrivalMemory {
  return { flying: new Set(), heard: new Set() };
}

describe("my fleet arrival cue", () => {
  it("stays quiet for a fleet that had already landed", () => {
    const state = memory();
    const landed = noteMyArrivals(
      [{ id: "1", player: ME, arrivalTick: 10 }],
      ME,
      20,
      state,
    );
    expect(landed).toBe(false);
  });

  it("rings once when a fleet I watched in flight reaches its arrival", () => {
    const state = memory();
    const voyage = { id: "1", player: ME.toLowerCase(), arrivalTick: 10 };
    expect(noteMyArrivals([voyage], ME, 9, state)).toBe(false);
    expect(noteMyArrivals([voyage], ME, 10, state)).toBe(true);
    expect(noteMyArrivals([voyage], ME, 11, state)).toBe(false);
  });

  it("rings for my fleet whether the landing is an attack or a reinforce", () => {
    const state = memory();
    const voyages = [
      { id: "attack", player: ME, arrivalTick: 5 },
      { id: "support", player: ME, arrivalTick: 5 },
    ];
    noteMyArrivals(voyages, ME, 4, state);
    expect(noteMyArrivals(voyages, ME, 5, state)).toBe(true);
  });

  it("ignores someone else's fleet", () => {
    const state = memory();
    const voyage = {
      id: "1",
      player: "0x1111111111111111111111111111111111111111",
      arrivalTick: 5,
    };
    noteMyArrivals([voyage], ME, 4, state);
    expect(noteMyArrivals([voyage], ME, 6, state)).toBe(false);
  });

  it("does not ring when a fleet disappears before it lands", () => {
    const state = memory();
    const voyage = { id: "1", player: ME, arrivalTick: 8 };
    noteMyArrivals([voyage], ME, 4, state);
    expect(noteMyArrivals([], ME, 9, state)).toBe(false);
  });
});

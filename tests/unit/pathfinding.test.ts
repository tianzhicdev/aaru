import { describe, expect, it } from "vitest";
import { findPath } from "@aaru/domain/pathfinding.ts";
import { WORLD_GRID_COLUMNS, WORLD_GRID_ROWS } from "@aaru/domain/constants.ts";

describe("A* pathfinding", () => {
  it("returns empty array when start equals goal", () => {
    const path = findPath({ x: 5, y: 5 }, { x: 5, y: 5 }, new Set());
    expect(path).toEqual([]);
  });

  it("returns empty array when goal is blocked", () => {
    const blocked = new Set(["10:10"]);
    const path = findPath({ x: 5, y: 5 }, { x: 10, y: 10 }, blocked);
    expect(path).toEqual([]);
  });

  it("finds a direct path with no obstacles", () => {
    const path = findPath({ x: 5, y: 5 }, { x: 8, y: 5 }, new Set());
    expect(path.length).toBeGreaterThan(0);
    // Path should end at goal
    expect(path[path.length - 1]).toEqual({ x: 8, y: 5 });
    // Path should not include start
    expect(path[0]).not.toEqual({ x: 5, y: 5 });
    // Straight horizontal path should be 3 cells
    expect(path.length).toBe(3);
  });

  it("routes around a single obstacle", () => {
    // Block cell (7,5) between start (5,5) and goal (9,5)
    const blocked = new Set(["7:5"]);
    const path = findPath({ x: 5, y: 5 }, { x: 9, y: 5 }, blocked);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 9, y: 5 });
    // None of the path cells should be blocked
    for (const cell of path) {
      expect(blocked.has(`${cell.x}:${cell.y}`)).toBe(false);
    }
  });

  it("routes around a wall of obstacles", () => {
    // Create a vertical wall at x=7, y=3..7
    const blocked = new Set(["7:3", "7:4", "7:5", "7:6", "7:7"]);
    const path = findPath({ x: 5, y: 5 }, { x: 10, y: 5 }, blocked);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 10, y: 5 });
    for (const cell of path) {
      expect(blocked.has(`${cell.x}:${cell.y}`)).toBe(false);
    }
  });

  it("returns empty array when goal is unreachable (enclosed by obstacles)", () => {
    // Surround goal (10,10) with obstacles on all 8 sides
    const blocked = new Set([
      "9:9", "10:9", "11:9",
      "9:10", "11:10",
      "9:11", "10:11", "11:11"
    ]);
    const path = findPath({ x: 5, y: 5 }, { x: 10, y: 10 }, blocked);
    expect(path).toEqual([]);
  });

  it("uses diagonal movement when optimal", () => {
    const path = findPath({ x: 5, y: 5 }, { x: 8, y: 8 }, new Set());
    // Diagonal path should be 3 cells (diagonal is shorter than L-shaped)
    expect(path.length).toBe(3);
    expect(path[path.length - 1]).toEqual({ x: 8, y: 8 });
  });

  it("truncates path at maxLength", () => {
    const path = findPath({ x: 0, y: 0 }, { x: 50, y: 50 }, new Set(), 5);
    expect(path.length).toBe(5);
    // Path should be the first 5 cells of the optimal route
    expect(path[0]).not.toEqual({ x: 0, y: 0 }); // excludes start
  });

  it("handles pathfinding from grid boundaries", () => {
    // Corner to corner
    const path = findPath(
      { x: 0, y: 0 },
      { x: WORLD_GRID_COLUMNS - 1, y: WORLD_GRID_ROWS - 1 },
      new Set()
    );
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({
      x: WORLD_GRID_COLUMNS - 1,
      y: WORLD_GRID_ROWS - 1
    });
    // All cells within bounds
    for (const cell of path) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(WORLD_GRID_COLUMNS);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeLessThan(WORLD_GRID_ROWS);
    }
  });

  it("finds optimal path length for cardinal movement", () => {
    // Horizontal: 10 cells east
    const path = findPath({ x: 5, y: 5 }, { x: 15, y: 5 }, new Set());
    expect(path.length).toBe(10);
  });

  it("finds optimal path length for pure diagonal", () => {
    // Diagonal: 10 cells SE
    const path = findPath({ x: 5, y: 5 }, { x: 15, y: 15 }, new Set());
    expect(path.length).toBe(10);
  });
});

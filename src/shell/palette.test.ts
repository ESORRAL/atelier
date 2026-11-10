import { describe, expect, it, vi } from "vitest";
import { execute, filterCommands, moveIndex, type Command } from "./palette";

const mk = (label: string, run = () => {}): Command => ({ id: label, label, group: "g", run });
const list = [mk("Nouvelle session"), mk("Réglages"), mk("Basculer le thème"), mk("Interrompre")];

describe("palette", () => {
  it("keeps order on empty query", () => expect(filterCommands(list, " ")).toEqual(list));
  it("ignores accents and case", () => expect(filterCommands(list, "REGL").map((c) => c.label)).toEqual(["Réglages"]));
  it("ranks prefix before word-prefix before substring", () => {
    const l = [mk("Ouvrir le thème"), mk("Ethernet"), mk("Thème")];
    expect(filterCommands(l, "the").map((c) => c.label)).toEqual(["Thème", "Ouvrir le thème", "Ethernet"]);
  });
  it("returns nothing when no match", () => expect(filterCommands(list, "zzz")).toEqual([]));
  it("wraps the active index", () => {
    expect(moveIndex(0, -1, 4)).toBe(3);
    expect(moveIndex(3, 1, 4)).toBe(0);
    expect(moveIndex(0, 1, 0)).toBe(0);
  });
  it("runs the command at the filtered index", () => {
    const run = vi.fn();
    expect(execute([mk("Alpha"), mk("Beta", run)], "b", 0)).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(execute(list, "zzz", 0)).toBe(false);
  });
});

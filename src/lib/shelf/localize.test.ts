import { describe, expect, it } from "vitest";
import { localizeShelfName } from "./localize";

describe("automatic shelf names in the current language", () => {
  it("translates names the app gave, keeping their size and number", () => {
    expect(localizeShelfName("Cube shelf 2×1", "es")).toBe("Estante de cubos 2×1");
    expect(localizeShelfName("Estante de cubos 5×5 (2)", "en")).toBe("Cube shelf 5×5 (2)");
    expect(localizeShelfName("Repisa de CD 1×1", "pt")).toBe("Estante de CD 1×1");
    expect(localizeShelfName("Living room", "es")).toBe("Sala");
    expect(localizeShelfName("Tower 3×5", "es")).toBe("Torre 3×5");
    expect(localizeShelfName("Custom shelf 3×3", "pt")).toBe("Móvel sob medida 3×3");
    expect(localizeShelfName("Singles", "pt")).toBe("Compactos");
  });

  it("leaves names the user wrote as they are", () => {
    for (const name of ["Jazz corner", "Cube shelf by the window", "Mi repisa 2×2", "Studio B"]) {
      expect(localizeShelfName(name, "es")).toBe(name);
    }
  });
});

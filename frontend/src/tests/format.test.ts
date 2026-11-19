import { describe, expect, it } from "vitest";
import { demandFromUsers, issuesByCenterRow, nextId, pickScenario } from "../features/draft";
import { km, num, pct, shortHash, signed } from "../utils/format";

describe("formato de interfaz (coma decimal)", () => {
  it("usa coma decimal y decimales fijos", () => {
    expect(num(0.75, 2)).toBe("0,75");
    expect(num(135)).toBe("135");
    expect(num(0.262784, 5)).toBe("0,26278");
    expect(km(62.613)).toBe("62,61 km");
    expect(pct(0.8576)).toBe("85,8 %");
  });

  it("muestra raya cuando no hay valor", () => {
    expect(num(null)).toBe("—");
    expect(num(Number.NaN)).toBe("—");
    expect(km(undefined)).toBe("—");
  });

  it("marca el signo de las diferencias", () => {
    expect(signed(-17.68, 2)).toBe("−17,68");
    expect(signed(5, 0)).toBe("+5");
    expect(signed(0.00001, 2)).toBe("0,00");
  });

  it("abrevia el hash", () => {
    expect(shortHash("abcdef0123456789", 6)).toBe("abcdef…");
    expect(shortHash(null)).toBe("—");
  });
});

describe("borrador de escenario", () => {
  it("descarta campos fuera del contrato, incluidos datos personales", () => {
    const loaded = pickScenario({
      label: "Prueba",
      centers: [{ id: "C01", name: "Centro ficticio", dni: "X", sexo: "F", demand_lots: 4 }],
      vehicles: [{ id: "V01", capacity_lots: 10, placa: "ABC" }],
    });
    const center = loaded.centers[0] as unknown as Record<string, unknown>;
    expect(center.dni).toBeUndefined();
    expect(center.sexo).toBeUndefined();
    expect(center.demand_lots).toBe(4);
    expect(loaded.vehicles[0]).toEqual({ id: "V01", capacity_lots: 10 });
  });

  it("acepta el formato de GET /scenarios/{id} y rechaza archivos ajenos", () => {
    expect(pickScenario({ scenario: { label: "x", centers: [] } }).label).toBe("x");
    expect(() => pickScenario({ foo: 1 })).toThrow();
  });

  it("agrupa errores por fila de centro", () => {
    const rows = issuesByCenterRow([
      { code: "A", message: "a", field: "centers[2].lat" },
      { code: "B", message: "b", field: "centers[2].demand_lots" },
      { code: "C", message: "c", field: "inventory_lots" },
    ]);
    expect(rows.get(2)).toHaveLength(2);
    expect(rows.size).toBe(1);
  });

  it("genera identificadores libres y aplica la regla declarada de demanda", () => {
    expect(nextId("C", ["C01", "C02"])).toBe("C03");
    expect(nextId("V", ["V02"])).toBe("V03");
    expect(demandFromUsers(85, 1, 10)).toBe(9);
    expect(demandFromUsers(60, 1, 10)).toBe(6);
  });
});

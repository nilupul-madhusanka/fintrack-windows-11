import { expect, test } from "vitest";
import { money } from "./money";
test("formats exact minor units, negative and beyond JS safe integer", () => {
  expect(money("125050")).toBe("LKR 1,250.50");
  expect(money("-1")).toBe("−LKR 0.01");
  expect(money("0")).toBe("LKR 0.00");
  expect(money("9223372036854775807")).toBe("LKR 92,233,720,368,547,758.07");
});

import { describe, it, expect } from "vitest";
import { ApiError, describeApiError } from "./api";

/**
 * The global error toast reads whatever this returns, so a 422 that does not
 * name its field turns into "Request validation failed" and a user staring at
 * a form that will not save.
 */

const validationError = (details: unknown) =>
  new ApiError("Request validation failed", 422, "validation_error", details);

describe("describeApiError", () => {
  it("names the field and the reason behind a validation error", () => {
    const err = validationError([
      {
        instancePath: "/description",
        message: "String must contain at most 200 character(s)",
      },
    ]);
    expect(describeApiError(err)).toBe(
      "Request validation failed: description — String must contain at most 200 character(s)",
    );
  });

  it("flattens a nested pointer into a readable path", () => {
    const err = validationError([{ instancePath: "/config/model", message: "Required" }]);
    expect(describeApiError(err)).toBe("Request validation failed: config.model — Required");
  });

  it("keeps a message that has no field pointer", () => {
    const err = validationError([{ message: "body must be object" }]);
    expect(describeApiError(err)).toBe("Request validation failed: body must be object");
  });

  it("deduplicates repeats and caps how many issues reach the toast", () => {
    const err = validationError([
      { instancePath: "/a", message: "Required" },
      { instancePath: "/a", message: "Required" },
      { instancePath: "/b", message: "Required" },
      { instancePath: "/c", message: "Required" },
      { instancePath: "/d", message: "Required" },
    ]);
    // Deduped to four, then truncated to three — a toast is not a form.
    expect(describeApiError(err)).toBe(
      "Request validation failed: a — Required; b — Required; c — Required",
    );
  });

  it("falls back to the plain message when there are no details", () => {
    expect(describeApiError(new ApiError("Skill not found", 404, "not_found"))).toBe(
      "Skill not found",
    );
    // A 500 whose details are a bare string must not be mistaken for issues.
    expect(describeApiError(new ApiError("boom", 500, "internal_error", "stack"))).toBe("boom");
  });

  it("handles a non-ApiError throw without inventing a field", () => {
    expect(describeApiError(new Error("offline"))).toBe("offline");
    expect(describeApiError("not an error")).toBe("Something went wrong");
  });
});

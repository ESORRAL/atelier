import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, MAX_IMAGES, pickImages, sizeLabel } from "./images";

const file = (type: string, size = 10) => ({ type, size, name: "x" }) as File;

describe("pickImages", () => {
  it("keeps supported pictures and ignores everything else", () => {
    const r = pickImages([file("image/png"), file("text/plain"), file("image/webp")], 0);
    expect(r.ok).toHaveLength(2);
    expect(r.problem).toBeNull();
  });
  it("refuses an unsupported picture format, a heavy picture and too many pictures, with a reason", () => {
    expect(pickImages([file("image/svg+xml")], 0)).toMatchObject({ ok: [], problem: expect.stringContaining("Format") });
    expect(pickImages([file("image/png", MAX_IMAGE_BYTES + 1)], 0)).toMatchObject({ ok: [], problem: expect.stringContaining("lourde") });
    const many = pickImages(Array.from({ length: MAX_IMAGES + 2 }, () => file("image/png")), 0);
    expect(many.ok).toHaveLength(MAX_IMAGES);
    expect(many.problem).toContain(`${MAX_IMAGES} images`);
    expect(pickImages([file("image/png")], MAX_IMAGES).ok).toHaveLength(0);
  });
  it("still attaches the good ones when one is refused", () => {
    const r = pickImages([file("image/png"), file("image/gif", MAX_IMAGE_BYTES + 1)], 0);
    expect(r.ok).toHaveLength(1);
    expect(r.problem).not.toBeNull();
  });
});

describe("sizeLabel", () => {
  it("says Ko or Mo", () => {
    expect(sizeLabel(500)).toBe("1 Ko");
    expect(sizeLabel(2048)).toBe("2 Ko");
    expect(sizeLabel(2.5 * 1024 * 1024)).toBe("2.5 Mo");
  });
});

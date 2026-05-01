import { describe, it, expect, vi } from "vitest";
import {
  computePhotoEtag,
  getSoulmatePhotoEtags,
  upsertSoulmatePhotos,
  type SoulmatePhoto
} from "../../workers/src/matchApp.ts";

type SqlMock = ReturnType<typeof vi.fn>;

interface PhotoRow {
  user_id: string;
  idx: number;
  data: Uint8Array;
  mime_type: string;
  byte_size: number;
  etag: string;
}

interface ProfileRow {
  user_id: string;
  photo_count: number;
}

function jpegBytes(...trailing: number[]): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...trailing]);
}

function makePhotoStore() {
  const photos: PhotoRow[] = [];
  const profile: ProfileRow = { user_id: "u1", photo_count: 0 };

  const sql: SqlMock = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?").trim();

    if (query.startsWith("DELETE FROM soulmate_photos")) {
      const userId = values[0] as string;
      for (let i = photos.length - 1; i >= 0; i--) {
        if (photos[i].user_id === userId) photos.splice(i, 1);
      }
      return [];
    }

    if (query.startsWith("INSERT INTO soulmate_photos")) {
      const [user_id, idx, data, mime_type, byte_size, etag] = values as [
        string,
        number,
        Uint8Array,
        string,
        number,
        string
      ];
      photos.push({ user_id, idx, data, mime_type, byte_size, etag });
      return [];
    }

    if (query.startsWith("UPDATE soulmate_profiles")) {
      const photo_count = values[0] as number;
      profile.photo_count = photo_count;
      return [];
    }

    if (query.startsWith("SELECT etag FROM soulmate_photos")) {
      const userId = values[0] as string;
      return photos
        .filter((p) => p.user_id === userId)
        .sort((a, b) => a.idx - b.idx)
        .map((p) => ({ etag: p.etag }));
    }

    throw new Error(`Unexpected query: ${query}`);
  });

  return { sql, photos, profile };
}

describe("computePhotoEtag", () => {
  it("returns a stable 12-hex-char digest for identical bytes", async () => {
    const a = await computePhotoEtag(new Uint8Array([1, 2, 3, 4]));
    const b = await computePhotoEtag(new Uint8Array([1, 2, 3, 4]));
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(a).toBe(b);
  });

  it("differs for different inputs", async () => {
    const a = await computePhotoEtag(new Uint8Array([1, 2, 3]));
    const b = await computePhotoEtag(new Uint8Array([1, 2, 4]));
    expect(a).not.toBe(b);
  });
});

describe("upsertSoulmatePhotos", () => {
  it("writes photos at idx 0..N-1 and updates photo_count", async () => {
    const { sql, photos, profile } = makePhotoStore();
    const inputs: SoulmatePhoto[] = [
      { data: jpegBytes(1), mime: "image/jpeg" },
      { data: jpegBytes(2), mime: "image/jpeg" }
    ];

    const { etags } = await upsertSoulmatePhotos(sql as never, "u1", inputs);

    expect(photos).toHaveLength(2);
    expect(photos.map((p) => p.idx).sort()).toEqual([0, 1]);
    expect(profile.photo_count).toBe(2);
    expect(etags).toHaveLength(2);
    expect(etags[0]).toMatch(/^[0-9a-f]{12}$/);
    expect(etags[0]).not.toBe(etags[1]);
  });

  it("replaces previous photos and packs indices when count shrinks", async () => {
    const { sql, photos, profile } = makePhotoStore();
    await upsertSoulmatePhotos(sql as never, "u1", [
      { data: jpegBytes(1), mime: "image/jpeg" },
      { data: jpegBytes(2), mime: "image/jpeg" },
      { data: jpegBytes(3), mime: "image/jpeg" }
    ]);
    expect(photos).toHaveLength(3);

    await upsertSoulmatePhotos(sql as never, "u1", [
      { data: jpegBytes(9), mime: "image/jpeg" }
    ]);

    expect(photos).toHaveLength(1);
    expect(photos[0].idx).toBe(0);
    expect(profile.photo_count).toBe(1);
  });

  it("clears all photos when given an empty array", async () => {
    const { sql, photos, profile } = makePhotoStore();
    await upsertSoulmatePhotos(sql as never, "u1", [
      { data: jpegBytes(1), mime: "image/jpeg" }
    ]);
    expect(photos).toHaveLength(1);

    await upsertSoulmatePhotos(sql as never, "u1", []);
    expect(photos).toHaveLength(0);
    expect(profile.photo_count).toBe(0);
  });
});

describe("getSoulmatePhotoEtags", () => {
  it("returns etags ordered by idx", async () => {
    const { sql } = makePhotoStore();
    await upsertSoulmatePhotos(sql as never, "u1", [
      { data: jpegBytes(1), mime: "image/jpeg" },
      { data: jpegBytes(2), mime: "image/jpeg" }
    ]);

    const etags = await getSoulmatePhotoEtags(sql as never, "u1");
    expect(etags).toHaveLength(2);
    expect(etags.every((e) => /^[0-9a-f]{12}$/.test(e))).toBe(true);
  });

  it("returns empty array when no photos", async () => {
    const { sql } = makePhotoStore();
    const etags = await getSoulmatePhotoEtags(sql as never, "u1");
    expect(etags).toEqual([]);
  });
});

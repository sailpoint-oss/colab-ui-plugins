import { describe, it, expect } from "vitest";
import { photoAttributesOf, photosByIdentity, toPhotoUri } from "../src/photos";

const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

describe("toPhotoUri", () => {
  it("wraps bare base64 in a data URI of the type its first bytes announce", () => {
    expect(toPhotoUri(JPEG)).toBe(`data:image/jpeg;base64,${JPEG}`);
    expect(toPhotoUri(PNG)).toBe(`data:image/png;base64,${PNG}`);
  });

  it("passes a ready data URI through", () => {
    expect(toPhotoUri(`data:image/png;base64,${PNG}`)).toBe(`data:image/png;base64,${PNG}`);
  });

  it("drops line breaks a connector may have folded the base64 with", () => {
    expect(toPhotoUri(`${JPEG.slice(0, 10)}\n${JPEG.slice(10)}`)).toBe(`data:image/jpeg;base64,${JPEG}`);
  });

  it("ignores URLs, non-images, blanks and non-strings", () => {
    expect(toPhotoUri("https://graph.microsoft.com/v1.0/me/photo/$value")).toBeNull();
    expect(toPhotoUri("SGVsbG8gd29ybGQ=")).toBeNull(); // base64, but of text
    expect(toPhotoUri("")).toBeNull();
    expect(toPhotoUri(null)).toBeNull();
    expect(toPhotoUri({ value: JPEG })).toBeNull();
  });
});

describe("photoAttributesOf", () => {
  it("lists the photo attributes an account schema declares, in order of preference", () => {
    const schemas = [
      { name: "group", attributes: [{ name: "photo" }] }, // not the account schema
      { name: "account", attributes: [{ name: "userid" }, { name: "thumbnailPhoto" }, { name: "profilePhoto" }] },
    ];
    expect(photoAttributesOf(schemas)).toEqual(["profilePhoto", "thumbnailPhoto"]);
  });

  it("finds none on a source without one", () => {
    expect(photoAttributesOf([{ name: "account", attributes: [{ name: "empid" }] }])).toEqual([]);
    expect(photoAttributesOf([])).toEqual([]);
  });
});

describe("photosByIdentity", () => {
  it("joins photos to identities by the account's identityId", () => {
    const photos = photosByIdentity([
      { identityId: "a", attributes: { profilePhoto: JPEG } },
      { identityId: "b", attributes: { displayName: "No photo" } },
      { identityId: null, attributes: { profilePhoto: PNG } }, // uncorrelated
    ]);
    expect([...photos]).toEqual([["a", `data:image/jpeg;base64,${JPEG}`]]);
  });

  it("reads whichever of the given attributes holds an image", () => {
    const photos = photosByIdentity(
      [{ identityId: "a", attributes: { thumbnailPhoto: PNG } }],
      ["profilePhoto", "thumbnailPhoto"],
    );
    expect(photos.get("a")).toBe(`data:image/png;base64,${PNG}`);
  });

  it("keeps the first photo when an identity has several accounts", () => {
    const photos = photosByIdentity([
      { identityId: "a", attributes: { profilePhoto: JPEG } },
      { identityId: "a", attributes: { profilePhoto: PNG } },
    ]);
    expect(photos.get("a")).toBe(`data:image/jpeg;base64,${JPEG}`);
  });

  it("adds to a map it is given, so pages accumulate", () => {
    const into = new Map([["x", "data:image/png;base64,old"]]);
    photosByIdentity([{ identityId: "a", attributes: { profilePhoto: JPEG } }], undefined, into);
    expect([...into.keys()]).toEqual(["x", "a"]);
  });
});

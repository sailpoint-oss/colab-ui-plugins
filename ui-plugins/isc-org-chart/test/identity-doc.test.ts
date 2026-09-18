import { describe, it, expect } from "vitest";
import {
  fromPublicIdentity,
  toOrgIdentity,
  type IdentityDoc,
  type PublicIdentityDoc,
} from "../src/identity-doc";

// Trimmed from a real POST /v3/search response against the identities index.
const doc: IdentityDoc = {
  id: "dd6bd99edcbd489ea506a0adfa06fb3a",
  name: "aarav.chauhan8c45",
  displayName: "Aarav Chauhan",
  manager: { id: "2b1ad09efc5a4d9db80332a77ba3eb14", name: "tom.gorczany", displayName: "Tom Gorczany" },
  attributes: { title: "Engineering Manager", location: "Pune, Maharashtra, India", department: "Engineering" },
};

// The first bytes of any JPEG, which is what marks the payload as an image.
const JPEG = "/9j/4AAQSkZJRgABAQ";

describe("toOrgIdentity", () => {
  it("prefers displayName over the uid in name", () => {
    expect(toOrgIdentity(doc).name).toBe("Aarav Chauhan");
  });

  // An HR feed commonly maps displayName straight from the login name, which
  // left every card reading `Isabelle.Lynch` rather than a person's name.
  it("builds the name from first and last when displayName is only the uid", () => {
    const asUid = {
      ...doc,
      displayName: doc.name,
      attributes: { ...doc.attributes, firstname: "Aarav", lastname: "Chauhan" },
    };
    expect(toOrgIdentity(asUid).name).toBe("Aarav Chauhan");
  });

  it("keeps a displayName that says more than the uid, preferred name and all", () => {
    const preferred = {
      ...doc,
      displayName: "Rav Chauhan",
      attributes: { ...doc.attributes, firstname: "Aarav", lastname: "Chauhan" },
    };
    expect(toOrgIdentity(preferred).name).toBe("Rav Chauhan");
  });

  it("settles for the uid when there is no name to build from", () => {
    expect(toOrgIdentity({ ...doc, displayName: doc.name, attributes: {} }).name).toBe("aarav.chauhan8c45");
  });

  it("lifts title, location and department out of attributes", () => {
    expect(toOrgIdentity(doc)).toMatchObject({
      title: "Engineering Manager",
      location: "Pune, Maharashtra, India",
      orgUnit: "Engineering",
    });
  });

  it("keeps the manager id for linking but shows the manager's display name", () => {
    expect(toOrgIdentity(doc).manager).toEqual({
      id: "2b1ad09efc5a4d9db80332a77ba3eb14",
      name: "Tom Gorczany",
    });
  });

  it("treats a managerless identity as a root", () => {
    expect(toOrgIdentity({ ...doc, manager: null }).manager).toBeNull();
  });

  it("reads a job title mapped as jobTitle rather than title", () => {
    // Profiles built from an HR feed often name it jobTitle; a tenant can show
    // location and department while leaving `title` unmapped entirely.
    expect(
      toOrgIdentity({
        id: "x",
        name: "uid",
        attributes: { jobTitle: "Regional Director", location: "Brussels", department: "Sales" },
      }),
    ).toMatchObject({ title: "Regional Director", location: "Brussels", orgUnit: "Sales" });
  });

  it("prefers title when a profile maps both", () => {
    expect(
      toOrgIdentity({ id: "x", name: "uid", attributes: { title: "A", jobTitle: "B" } }).title,
    ).toBe("A");
  });

  it("treats a blank attribute as missing", () => {
    expect(toOrgIdentity({ id: "x", name: "uid", attributes: { title: "  " } }).title).toBe("—");
  });

  it("takes a photo promoted onto the identity, under any of the account names", () => {
    for (const name of ["profilePhoto", "thumbnailPhoto", "jpegPhoto", "photo"]) {
      const promoted = { ...doc, attributes: { ...doc.attributes, [name]: JPEG } };
      expect(toOrgIdentity(promoted).photo).toBe(`data:image/jpeg;base64,${JPEG}`);
    }
  });

  it("leaves the photo unset when no attribute holds an image", () => {
    expect(toOrgIdentity(doc).photo).toBeUndefined();
    // A tenant that maps the attribute but has no photo for this person sends
    // the empty string, which must not become a broken data URI.
    expect(toOrgIdentity({ ...doc, attributes: { profilePhoto: "" } }).photo).toBeUndefined();
  });

  it("falls back to the uid and placeholders when attributes are absent", () => {
    expect(toOrgIdentity({ id: "x", name: "uid.only" })).toEqual({
      id: "x",
      name: "uid.only",
      title: "—",
      location: "—",
      orgUnit: "—",
      manager: null,
      uid: "uid.only", // the login name the Related Actions use
    });
  });
});

// Trimmed from a real GET /v3/public-identities response.
const pub: PublicIdentityDoc = {
  id: "98a5443248f84a86a4377194e934805b",
  name: "Aaron Nichols",
  alias: "Aaron.Nichols",
  manager: { id: "ba1e6de16695481ebde68dc8f2a3b7db", name: "Jerry Bennett" },
  attributes: [],
};

describe("fromPublicIdentity", () => {
  it("shows name, keeps alias as the uid, and links the manager", () => {
    expect(fromPublicIdentity(pub)).toMatchObject({
      id: "98a5443248f84a86a4377194e934805b",
      name: "Aaron Nichols",
      uid: "Aaron.Nichols",
      manager: { id: "ba1e6de16695481ebde68dc8f2a3b7db", name: "Jerry Bennett" },
    });
  });

  it("shows placeholders when the public identity config exposes nothing", () => {
    expect(fromPublicIdentity(pub)).toMatchObject({ title: "—", location: "—", orgUnit: "—" });
  });

  it("reads exposed attributes from their key/value pairs", () => {
    const attributes = [
      { key: "jobTitle", name: "Job Title", value: "Inventory Analyst III" },
      { key: "location", name: "Location", value: "Taipei" },
      { key: "department", name: "Department", value: "Finance" },
    ];
    expect(fromPublicIdentity({ ...pub, attributes })).toMatchObject({
      title: "Inventory Analyst III",
      location: "Taipei",
      orgUnit: "Finance",
    });
  });

  it("treats a managerless identity as a root", () => {
    expect(fromPublicIdentity({ ...pub, manager: null }).manager).toBeNull();
  });

  // The accounts API the photo scan uses is admin-only, so an exposed photo
  // attribute is the only face a plain user's tree can show.
  it("reads a photo the public identity config exposes", () => {
    const attributes = [{ key: "profilePhoto", name: "Profile Photo", value: JPEG }];
    expect(fromPublicIdentity({ ...pub, attributes }).photo).toBe(`data:image/jpeg;base64,${JPEG}`);
  });
});

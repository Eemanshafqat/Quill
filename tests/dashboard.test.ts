import { describe, it, expect } from "vitest";
import supertest from "supertest";

// Environment (QUILL_DB_PATH, SESSION_SECRET) is configured in
// tests/setup.ts, which Vitest guarantees runs before this file's imports
// are evaluated. See that file for why it must not be done here instead.
import { createApp } from "../src/server";
import { extractCsrf } from "./helpers";

const app = createApp();

function agent() {
  return supertest.agent(app);
}

async function signUp(a: ReturnType<typeof agent>, email: string, password = "password123") {
  const getRes = await a.get("/signup");
  const csrf = extractCsrf(getRes.text);
  return a.post("/signup").type("form").send({ email, password, confirmPassword: password, _csrf: csrf });
}

async function logIn(a: ReturnType<typeof agent>, email: string, password = "password123") {
  const getRes = await a.get("/login");
  const csrf = extractCsrf(getRes.text);
  return a.post("/login").type("form").send({ email, password, _csrf: csrf });
}

async function getCsrfFrom(a: ReturnType<typeof agent>, url: string) {
  const res = await a.get(url);
  return extractCsrf(res.text);
}

describe("Authentication", () => {
  it("signup creates an account and redirects to dashboard", async () => {
    const a = agent();
    const res = await signUp(a, "alice@example.com");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
  });

  it("login succeeds with correct credentials", async () => {
    const a = agent();
    await signUp(a, "bob@example.com", "correcthorse1");
    const b = agent();
    const res = await logIn(b, "bob@example.com", "correcthorse1");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
  });

  it("login fails with wrong password and shows generic error", async () => {
    const a = agent();
    await signUp(a, "carol@example.com", "rightpassword1");
    const b = agent();
    const res = await logIn(b, "carol@example.com", "wrongpassword1");
    expect(res.status).toBe(401);
    expect(res.text).toContain("Invalid email or password.");
  });

  it("login fails for unknown email without revealing existence", async () => {
    const a = agent();
    const res = await logIn(a, "doesnotexist@example.com", "whatever12");
    expect(res.status).toBe(401);
    expect(res.text).toContain("Invalid email or password.");
  });

  it("logout destroys session and redirects to login", async () => {
    const a = agent();
    await signUp(a, "dave@example.com");
    const csrf = await getCsrfFrom(a, "/dashboard");
    const res = await a.post("/logout").type("form").send({ _csrf: csrf });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
    const after = await a.get("/dashboard");
    expect(after.status).toBe(302);
    expect(after.headers.location).toBe("/login");
  });

  it("unauthenticated users are redirected to /login for protected routes", async () => {
    const a = agent();
    for (const url of ["/dashboard", "/dashboard/posts", "/dashboard/analytics", "/dashboard/account"]) {
      const res = await a.get(url);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/login");
    }
  });
});

describe("Posts", () => {
  it("authenticated user can create, list, and edit their own post", async () => {
    const a = agent();
    await signUp(a, "erin@example.com");

    const newFormCsrf = extractCsrf((await a.get("/dashboard/posts/new")).text);
    const createRes = await a
      .post("/dashboard/posts")
      .type("form")
      .send({ title: "My First Post", content: "# Hello world", tags: "ai, mcp", _csrf: newFormCsrf });
    expect(createRes.status).toBe(302);
    expect(createRes.headers.location).toMatch(/\/dashboard\/posts\/.+\/edit/);

    const listRes = await a.get("/dashboard/posts");
    expect(listRes.text).toContain("My First Post");

    const postId = createRes.headers.location.split("/")[3];
    const editCsrf = extractCsrf((await a.get(`/dashboard/posts/${postId}/edit`)).text);
    const updateRes = await a
      .post(`/dashboard/posts/${postId}`)
      .type("form")
      .send({ title: "Updated Title", content: "# Updated", tags: "ai", _csrf: editCsrf });
    expect(updateRes.status).toBe(302);

    const editAgain = await a.get(`/dashboard/posts/${postId}/edit`);
    expect(editAgain.text).toContain("Updated Title");
  });

  it("rejects a post with a missing title", async () => {
    const a = agent();
    await signUp(a, "frank@example.com");
    const csrf = extractCsrf((await a.get("/dashboard/posts/new")).text);
    const res = await a.post("/dashboard/posts").type("form").send({ title: "", content: "body", _csrf: csrf });
    expect(res.status).toBe(400);
    expect(res.text).toContain("Title is required.");
  });

  it("delete requires POST confirmation and removes the post", async () => {
    const a = agent();
    await signUp(a, "grace@example.com");
    const csrf1 = extractCsrf((await a.get("/dashboard/posts/new")).text);
    const create = await a
      .post("/dashboard/posts")
      .type("form")
      .send({ title: "To Delete", content: "content", _csrf: csrf1 });
    const postId = create.headers.location.split("/")[3];

    const confirmPage = await a.get(`/dashboard/posts/${postId}/delete`);
    expect(confirmPage.status).toBe(200);
    expect(confirmPage.text).toContain("cannot be undone");

    const csrf2 = extractCsrf(confirmPage.text);
    const del = await a.post(`/dashboard/posts/${postId}/delete`).type("form").send({ _csrf: csrf2 });
    expect(del.status).toBe(302);
    expect(del.headers.location).toBe("/dashboard/posts");

    const afterList = await a.get("/dashboard/posts");
    expect(afterList.text).not.toContain("To Delete");
  });
});

describe("Publishing", () => {
  it("publish shows a confirmation step before the POST publishes the post", async () => {
    const a = agent();
    await signUp(a, "hank@example.com");
    const csrf1 = extractCsrf((await a.get("/dashboard/posts/new")).text);
    const create = await a
      .post("/dashboard/posts")
      .type("form")
      .send({ title: "Publish Me", content: "content", _csrf: csrf1 });
    const postId = create.headers.location.split("/")[3];

    const confirmPage = await a.get(`/dashboard/posts/${postId}/publish`);
    expect(confirmPage.text).toContain("publicly visible");

    const csrf2 = extractCsrf(confirmPage.text);
    const publish = await a.post(`/dashboard/posts/${postId}/publish`).type("form").send({ _csrf: csrf2 });
    expect(publish.status).toBe(302);

    const edit = await a.get(`/dashboard/posts/${postId}/edit`);
    expect(edit.text).toContain("published");
  });

  it("schedule requires a future date/time", async () => {
    const a = agent();
    await signUp(a, "ivy@example.com");
    const csrf1 = extractCsrf((await a.get("/dashboard/posts/new")).text);
    const create = await a
      .post("/dashboard/posts")
      .type("form")
      .send({ title: "Schedule Me", content: "content", _csrf: csrf1 });
    const postId = create.headers.location.split("/")[3];

    const schedulePage = await a.get(`/dashboard/posts/${postId}/schedule`);
    const csrf2 = extractCsrf(schedulePage.text);

    const pastRes = await a
      .post(`/dashboard/posts/${postId}/schedule`)
      .type("form")
      .send({ date: "2000-01-01", time: "10:00", _csrf: csrf2 });
    expect(pastRes.status).toBe(400);
    expect(pastRes.text).toContain("future");

    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const futureDate = future.toISOString().slice(0, 10);
    const okRes = await a
      .post(`/dashboard/posts/${postId}/schedule`)
      .type("form")
      .send({ date: futureDate, time: "10:00", _csrf: csrf2 });
    expect(okRes.status).toBe(302);

    const edit = await a.get(`/dashboard/posts/${postId}/edit`);
    expect(edit.text).toContain("scheduled");
  });

  it("unpublish returns a published post to draft", async () => {
    const a = agent();
    await signUp(a, "jack@example.com");
    const csrf1 = extractCsrf((await a.get("/dashboard/posts/new")).text);
    const create = await a
      .post("/dashboard/posts")
      .type("form")
      .send({ title: "Unpublish Me", content: "content", _csrf: csrf1 });
    const postId = create.headers.location.split("/")[3];

    const pubCsrf = extractCsrf((await a.get(`/dashboard/posts/${postId}/publish`)).text);
    await a.post(`/dashboard/posts/${postId}/publish`).type("form").send({ _csrf: pubCsrf });

    const unpubPage = await a.get(`/dashboard/posts/${postId}/unpublish`);
    const unpubCsrf = extractCsrf(unpubPage.text);
    const res = await a.post(`/dashboard/posts/${postId}/unpublish`).type("form").send({ _csrf: unpubCsrf });
    expect(res.status).toBe(302);

    const edit = await a.get(`/dashboard/posts/${postId}/edit`);
    expect(edit.text).toContain("draft");
  });
});

describe("SEO", () => {
  it("rejects an invalid slug with a helpful message", async () => {
    const a = agent();
    await signUp(a, "kate@example.com");
    const csrf1 = extractCsrf((await a.get("/dashboard/posts/new")).text);
    const create = await a
      .post("/dashboard/posts")
      .type("form")
      .send({ title: "SEO Post", content: "content", _csrf: csrf1 });
    const postId = create.headers.location.split("/")[3];

    const editPage = await a.get(`/dashboard/posts/${postId}/edit`);
    const csrf2 = extractCsrf(editPage.text);
    const res = await a
      .post(`/dashboard/posts/${postId}/seo`)
      .type("form")
      .send({ metaTitle: "Title", metaDescription: "Desc", slug: "Not A Valid Slug!", _csrf: csrf2 });
    expect(res.status).toBe(400);
    expect(res.text).toContain("lowercase letters, numbers, and hyphens");
  });

  it("saves valid SEO settings", async () => {
    const a = agent();
    await signUp(a, "leo@example.com");
    const csrf1 = extractCsrf((await a.get("/dashboard/posts/new")).text);
    const create = await a
      .post("/dashboard/posts")
      .type("form")
      .send({ title: "SEO Good Post", content: "content", _csrf: csrf1 });
    const postId = create.headers.location.split("/")[3];

    const editPage = await a.get(`/dashboard/posts/${postId}/edit`);
    const csrf2 = extractCsrf(editPage.text);
    const res = await a
      .post(`/dashboard/posts/${postId}/seo`)
      .type("form")
      .send({ metaTitle: "Great Title", metaDescription: "Great description", slug: "seo-good-post", _csrf: csrf2 });
    expect(res.status).toBe(302);

    const after = await a.get(`/dashboard/posts/${postId}/edit`);
    expect(after.text).toContain("seo-good-post");
  });
});

describe("Security / user isolation", () => {
  it("a user cannot view or edit another user's post", async () => {
    const owner = agent();
    await signUp(owner, "owner@example.com");
    const csrf1 = extractCsrf((await owner.get("/dashboard/posts/new")).text);
    const create = await owner
      .post("/dashboard/posts")
      .type("form")
      .send({ title: "Private Post", content: "secret content", _csrf: csrf1 });
    const postId = create.headers.location.split("/")[3];

    const intruder = agent();
    await signUp(intruder, "intruder@example.com");
    const res = await intruder.get(`/dashboard/posts/${postId}/edit`);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("secret content");
  });

  it("a user cannot delete another user's post", async () => {
    const owner = agent();
    await signUp(owner, "owner2@example.com");
    const csrf1 = extractCsrf((await owner.get("/dashboard/posts/new")).text);
    const create = await owner
      .post("/dashboard/posts")
      .type("form")
      .send({ title: "Owner2 Post", content: "content", _csrf: csrf1 });
    const postId = create.headers.location.split("/")[3];

    const intruder = agent();
    await signUp(intruder, "intruder2@example.com");
    const csrf2 = extractCsrf((await intruder.get("/dashboard/account")).text);
    const del = await intruder.post(`/dashboard/posts/${postId}/delete`).type("form").send({ _csrf: csrf2 });
    expect(del.status).toBe(404);

    // Original owner should still see the post.
    const stillThere = await owner.get("/dashboard/posts");
    expect(stillThere.text).toContain("Owner2 Post");
  });

  it("protected routes reject requests with no session at all", async () => {
    const res = await supertest(app).get("/dashboard/posts");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("state-changing POST without a valid CSRF token is rejected", async () => {
    const a = agent();
    await signUp(a, "mia@example.com");
    const res = await a.post("/dashboard/posts").type("form").send({ title: "x", content: "y", _csrf: "bogus" });
    expect(res.status).toBe(403);
  });
});

describe("Account / API keys", () => {
  it("shows a masked API key on the account page and never the raw value", async () => {
    const a = agent();
    await signUp(a, "nina@example.com");
    const res = await a.get("/dashboard/account");
    expect(res.status).toBe(200);
    expect(res.text).toContain("qk_live_");
    expect(res.text).toContain("••••");
  });

  it("rotate requires confirmation and shows the new key exactly once", async () => {
    const a = agent();
    await signUp(a, "omar@example.com");
    const confirmPage = await a.get("/dashboard/account/api-key/rotate");
    expect(confirmPage.text).toContain("stop working");
    const csrf = extractCsrf(confirmPage.text);
    const res = await a.post("/dashboard/account/api-key/rotate").type("form").send({ _csrf: csrf });
    expect(res.status).toBe(200);
    expect(res.text).toContain("only be shown once");

    const again = await a.get("/dashboard/account");
    expect(again.text).not.toContain("only be shown once");
  });

  it("revoke requires confirmation and clears the key", async () => {
    const a = agent();
    await signUp(a, "priya@example.com");
    const confirmPage = await a.get("/dashboard/account/api-key/revoke");
    const csrf = extractCsrf(confirmPage.text);
    const res = await a.post("/dashboard/account/api-key/revoke").type("form").send({ _csrf: csrf });
    expect(res.status).toBe(302);

    const account = await a.get("/dashboard/account");
    expect(account.text).toContain("API key revoked successfully");
    expect(account.text).toContain("No active API key");
  });
});

describe("Analytics", () => {
  it("renders the analytics page for the authenticated user", async () => {
    const a = agent();
    await signUp(a, "quinn@example.com");
    const res = await a.get("/dashboard/analytics");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Total Views");
    expect(res.text).toContain("Top Posts");
    expect(res.text).toContain("Top Referrers");
  });
});

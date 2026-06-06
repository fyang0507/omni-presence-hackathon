import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPageRequest, resolveProps, type NotionSchema } from "../src/notion/client.ts";

const schema: NotionSchema = {
  id: "3619782c-4f4a-804a-9670-000be28dec1a",
  title: "Technical Reading",
  kind: "data_source",
  properties: {
    Name: "title",
    Status: "status",
    "Expected Reading Time": "number",
  },
};

test("resolveProps discovers title, status, and reading-time properties", () => {
  const r = resolveProps(schema);
  assert.equal(r.titleProp, "Name");
  assert.deepEqual(r.statusProp, { name: "Status", type: "status" });
  assert.deepEqual(r.readingProp, { name: "Expected Reading Time", type: "number" });
});

test("buildPageRequest writes reading time as rich_text when the live schema uses rich_text", () => {
  const liveSchema: NotionSchema = {
    ...schema,
    properties: {
      Name: "title",
      Status: "status",
      "Expected Reading Time": "rich_text",
    },
  };
  const body = buildPageRequest(liveSchema, {
    title: "Y",
    url: "https://youtu.be/y",
    readingMinutes: 14,
  }) as any;
  assert.equal(body.properties["Expected Reading Time"].rich_text[0].text.content, "14 min");
});

test("buildPageRequest builds a data_source page with status + bookmark + notes", () => {
  const body = buildPageRequest(schema, {
    title: "How Claude Code Works",
    url: "https://youtu.be/abc",
    readingMinutes: 15,
    notes: "Great overview.",
  }) as any;

  assert.deepEqual(body.parent, {
    type: "data_source_id",
    data_source_id: schema.id,
  });
  assert.equal(body.properties.Name.title[0].text.content, "How Claude Code Works");
  assert.deepEqual(body.properties.Status, { status: { name: "Not started" } });
  assert.deepEqual(body.properties["Expected Reading Time"], { number: 15 });
  assert.equal(body.children[0].type, "bookmark");
  assert.equal(body.children[0].bookmark.url, "https://youtu.be/abc");
  assert.equal(body.children[1].type, "paragraph");
});

test("buildPageRequest uses select when Status is a select and skips empty reading time", () => {
  const selectSchema: NotionSchema = {
    ...schema,
    kind: "database",
    properties: { Name: "title", Status: "select" },
  };
  const body = buildPageRequest(selectSchema, {
    title: "X",
    url: "https://youtu.be/x",
    status: "In progress",
  }) as any;
  assert.deepEqual(body.parent, { type: "database_id", database_id: schema.id });
  assert.deepEqual(body.properties.Status, { select: { name: "In progress" } });
  assert.equal("Expected Reading Time" in body.properties, false);
});

test("buildPageRequest throws when no title property exists", () => {
  const bad: NotionSchema = { ...schema, properties: { Status: "status" } };
  assert.throws(() => buildPageRequest(bad, { title: "x", url: "https://youtu.be/x" }));
});

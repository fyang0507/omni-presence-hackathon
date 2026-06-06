import { Client } from "@notionhq/client";

export interface NotionSchema {
  id: string;
  title: string;
  kind: "data_source" | "database";
  /** property name -> Notion property type */
  properties: Record<string, string>;
}

export interface ReadingArtifact {
  title: string;
  url: string;
  status?: string;
  readingMinutes?: number | null;
  notes?: string | null;
}

export function createClient(apiKey: string): Client {
  return new Client({ auth: apiKey });
}

interface RawRetrieve {
  id: string;
  object?: string;
  url?: string;
  title?: Array<{ plain_text?: string }>;
  properties?: Record<string, { type?: string }>;
}

/** Retrieve and normalize the target schema (data source preferred, db fallback). */
export async function retrieveSchema(client: Client, dataSourceId: string): Promise<NotionSchema> {
  const ds = client.dataSources;
  const raw = (
    ds?.retrieve
      ? await ds.retrieve({ data_source_id: dataSourceId })
      : await client.databases.retrieve({ database_id: dataSourceId })
  ) as unknown as RawRetrieve;
  const properties: Record<string, string> = {};
  for (const [name, prop] of Object.entries(raw.properties ?? {})) {
    properties[name] = prop.type ?? "unknown";
  }
  return {
    id: raw.id,
    title: raw.title?.map((t) => t.plain_text ?? "").join("") || "(untitled)",
    kind: raw.object === "database" ? "database" : "data_source",
    properties,
  };
}

/** Names of the properties we map onto, discovered from the live schema. */
export function resolveProps(schema: NotionSchema): {
  titleProp: string | null;
  statusProp: { name: string; type: string } | null;
  readingProp: { name: string; type: string } | null;
} {
  let titleProp: string | null = null;
  let statusProp: { name: string; type: string } | null = null;
  let readingProp: { name: string; type: string } | null = null;
  for (const [name, type] of Object.entries(schema.properties)) {
    if (type === "title") titleProp = name;
    if ((type === "status" || type === "select") && /status/i.test(name)) {
      statusProp = { name, type };
    }
    // The live DB stores "Expected Reading Time" as rich_text, not number — accept either.
    if (/(reading|watch).*time/i.test(name) && (type === "number" || type === "rich_text")) {
      readingProp = { name, type };
    }
  }
  return { titleProp, statusProp, readingProp };
}

/**
 * Ensure the target data source has the properties the demo writes to:
 * a Status (created as `select` — the API cannot create `status`-type props)
 * and an "Expected Reading Time" number. Idempotent: only adds what's missing.
 */
export async function ensureReadingSchema(
  client: Client,
  dataSourceId: string,
): Promise<{ added: string[]; titleProp: string | null }> {
  const schema = await retrieveSchema(client, dataSourceId);
  const { titleProp, statusProp, readingProp } = resolveProps(schema);
  const props: Record<string, unknown> = {};
  const added: string[] = [];
  if (!statusProp) {
    props["Status"] = {
      select: {
        options: [{ name: "Not started" }, { name: "In progress" }, { name: "Done" }],
      },
    };
    added.push("Status");
  }
  if (!readingProp) {
    props["Expected Reading Time"] = { number: {} };
    added.push("Expected Reading Time");
  }
  if (added.length) {
    await client.dataSources.update({ data_source_id: dataSourceId, properties: props } as never);
  }
  return { added, titleProp };
}

/** Build the pages.create request body. Pure + exported for tests. */
export function buildPageRequest(
  schema: NotionSchema,
  artifact: ReadingArtifact,
): Record<string, unknown> {
  const { titleProp, statusProp, readingProp } = resolveProps(schema);
  if (!titleProp) throw new Error(`No title property found in Notion schema "${schema.title}".`);

  const properties: Record<string, unknown> = {
    [titleProp]: { title: [{ type: "text", text: { content: artifact.title } }] },
  };
  const status = artifact.status ?? "Not started";
  if (statusProp) {
    properties[statusProp.name] =
      statusProp.type === "status" ? { status: { name: status } } : { select: { name: status } };
  }
  if (readingProp && artifact.readingMinutes != null) {
    properties[readingProp.name] =
      readingProp.type === "number"
        ? { number: artifact.readingMinutes }
        : {
            rich_text: [
              { type: "text", text: { content: `${artifact.readingMinutes} min` } },
            ],
          };
  }

  const children: unknown[] = [{ object: "block", type: "bookmark", bookmark: { url: artifact.url } }];
  if (artifact.notes && artifact.notes.trim()) {
    children.push({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ type: "text", text: { content: artifact.notes.trim() } }] },
    });
  }

  const parent =
    schema.kind === "data_source"
      ? { type: "data_source_id", data_source_id: schema.id }
      : { type: "database_id", database_id: schema.id };

  return { parent, properties, children };
}

export async function createPage(
  client: Client,
  body: Record<string, unknown>,
): Promise<{ id: string; url: string }> {
  // Cast: the create payload shape is validated by buildPageRequest above.
  const page = (await client.pages.create(body as never)) as { id: string; url?: string };
  return { id: page.id, url: page.url ?? "" };
}

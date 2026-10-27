import { application } from "../functionDirectory/app.ts";

type Row = Record<string, any>;

const tables = new Map<string, Row[]>();

function table(name: string): Row[] {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name)!;
}

class Query implements PromiseLike<any> {
  private tableName: string;
  private op: "select" | "insert" | "insertIfAbsent" | "update" | "delete" = "select";
  private filters: [string, any][] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private payload: Row | null = null;
  private conflict: string[] = [];
  private wantsCount = false;

  constructor(name: string) {
    this.tableName = name;
  }

  select(_columns?: string, options?: { count?: string }): this {
    if (options?.count === "exact") this.wantsCount = true;
    return this;
  }

  eq(column: string, value: any): this {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy = { col: column, asc: options?.ascending !== false };
    return this;
  }

  limit(value: number): this {
    this.max = value;
    return this;
  }

  insert(value: Row): this {
    this.op = "insert";
    this.payload = value;
    return this;
  }

  insertIfAbsent(value: Row, options?: { onConflict?: string }): this {
    this.op = "insertIfAbsent";
    this.payload = value;
    this.conflict = String(options?.onConflict ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return this;
  }

  update(value: Row): this {
    this.op = "update";
    this.payload = value;
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(([column, value]) => row[column] === value);
  }

  private execute(): { data: Row[]; error: null; count?: number | null } {
    const rows = table(this.tableName);
    if (this.op === "insert") {
      const row = { ...(this.payload ?? {}) };
      rows.push(row);
      return { data: [row], error: null };
    }
    if (this.op === "insertIfAbsent") {
      const row = { ...(this.payload ?? {}) };
      const duplicate = rows.some((candidate) =>
        this.conflict.length > 0 && this.conflict.every((column) => candidate[column] === row[column])
      );
      if (duplicate) return { data: [], error: null };
      rows.push(row);
      return { data: [row], error: null };
    }
    if (this.op === "update") {
      const updated: Row[] = [];
      for (const row of rows) {
        if (!this.matches(row)) continue;
        Object.assign(row, this.payload ?? {});
        updated.push(row);
      }
      return { data: updated, error: null };
    }
    if (this.op === "delete") {
      const removed: Row[] = [];
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (this.matches(rows[index])) {
          removed.push(rows[index]);
          rows.splice(index, 1);
        }
      }
      return { data: removed, error: null };
    }
    let data = rows.filter((row) => this.matches(row));
    const total = data.length;
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      data = [...data].sort((left, right) => {
        const a = left[col];
        const b = right[col];
        if (a === b) return 0;
        return (a < b ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    if (this.max != null) data = data.slice(0, this.max);
    return {
      data: data.map((row) => ({ ...row })),
      error: null,
      count: this.wantsCount ? total : null,
    };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

const db = {
  from(name: string) {
    return new Query(name);
  },
};

const objects = new Map<string, { bytes: Uint8Array; type: string }>();

const storage = {
  async upload(path: string, bytes: Uint8Array, options?: { contentType?: string }) {
    objects.set(path, { bytes, type: options?.contentType ?? "application/octet-stream" });
    return { path };
  },
  async download(path: string) {
    const found = objects.get(path);
    if (!found) throw new Error("storage_object_not_found");
    return new Response(found.bytes as unknown as BodyInit, { headers: { "content-type": found.type } });
  },
  async remove(paths: string[]) {
    for (const path of paths) objects.delete(path);
    return { deleted: paths.length };
  },
  async createSignedUrl(path: string, _expires?: number) {
    if (!objects.has(path)) throw new Error("storage_object_not_found");
    return { signedUrl: `/__mock/objects/${path.split("/").map(encodeURIComponent).join("/")}` };
  },
  async createSignedUploadUrl(path: string) {
    return { signedUrl: `/__mock/objects/${path.split("/").map(encodeURIComponent).join("/")}` };
  },
};

const handle = application({ db, storage });

const LOOK = (hair: string, shirt: string, pants: string, accent: string) => ({
  hair,
  hairDark: "#181425",
  skin: "#e8b796",
  skinDark: "#c28569",
  shirt,
  shirtDark: "#124e89",
  pants,
  pantsDark: "#181425",
  shoes: "#181425",
  accent,
  outline: "#181425",
});

function seed() {
  const created = new Date(Date.now() - 86_400_000 * 4).toISOString();
  table("members").push(
    {
      id: "11111111-1111-4111-8111-111111111111",
      nickname: "阿岚",
      role: "member",
      avatar: { look: LOOK("#68386c", "#3e8948", "#c28569", "#fee761"), pixel: null },
      cosmetics: null,
      intro: "住进 217 的第 3 天。喜欢在窗边发呆，负责把大家的合照挂上墙。",
      tags: ["夜猫子", "咖啡续命", "挂照片担当"],
      last_x: 250,
      last_y: 222,
      last_dir: "left",
      last_seen: null,
      created_at: created,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      nickname: "小满",
      role: "member",
      avatar: { look: LOOK("#f77622", "#f6757a", "#3a4466", "#fee761"), pixel: null },
      cosmetics: null,
      intro: "隔壁房间的常客，进门从不敲门。最近沉迷鱼缸，号称要集齐 8 种鱼。",
      tags: ["钓鱼佬", "话很多", "会做饭"],
      last_x: 96,
      last_y: 166,
      last_dir: "down",
      last_seen: null,
      created_at: created,
    },
  );
  table("messages").push(
    {
      id: "33333333-3333-4333-8333-333333333333",
      member_id: "22222222-2222-4222-8222-222222222222",
      body: "今晚有人一起钓鱼吗？鱼缸还差一条锦鲤。",
      created_at: new Date(Date.now() - 3_600_000).toISOString(),
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      member_id: "11111111-1111-4111-8111-111111111111",
      body: "新洗的床单已经铺好啦，回来记得把鞋摆好。",
      created_at: new Date(Date.now() - 7_200_000).toISOString(),
    },
  );
  table("settings").push({
    key: "room",
    value: { city: { name: "上海", lat: 31.2304, lon: 121.4737 }, weatherOverride: "clear" },
    updated_at: new Date().toISOString(),
  });
  table("affinity").push({
    id: "55555555-5555-4555-8555-555555555555",
    member_id: "11111111-1111-4111-8111-111111111111",
    target_id: "22222222-2222-4222-8222-222222222222",
    day: "2026-01-01",
    created_at: new Date().toISOString(),
  });
}

seed();

function objectResponse(pathname: string): Response {
  const raw = pathname.slice("/__mock/objects/".length);
  const path = raw.split("/").map((part) => decodeURIComponent(part)).join("/");
  const found = objects.get(path);
  if (!found) return new Response("not found", { status: 404 });
  return new Response(found.bytes as unknown as BodyInit, {
    headers: { "content-type": found.type, "cache-control": "no-store" },
  });
}

Deno.serve({ hostname: "127.0.0.1", port: 8000 }, async (request: Request) => {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/__mock/objects/")) return objectResponse(pathname);
  return await handle({ request, requestId: "local" });
});

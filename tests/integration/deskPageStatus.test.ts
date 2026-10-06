import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

function serverEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.AUTH_TRUST_USER_HEADER;
  return env;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

describe("unsigned desk document status", () => {
  let child: ChildProcess | undefined;
  let baseUrl = "";
  let logs = "";

  beforeAll(async () => {
    const env = serverEnv();
    await execFileAsync(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], {
      cwd: repoRoot,
      env,
      timeout: 180_000,
    });
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: repoRoot,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { logs += chunk; });
    child.stderr?.on("data", (chunk) => { logs += chunk; });
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`next start did not become ready\n${logs}`)), 30_000);
      const watch = (chunk: string) => {
        if (chunk.includes("Ready")) {
          clearTimeout(timer);
          resolve();
        }
      };
      child?.stdout?.on("data", watch);
      child?.stderr?.on("data", watch);
      child?.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`next start exited ${code}\n${logs}`));
      });
    });
    await ready;
  }, 180_000);

  afterAll(async () => {
    if (!child?.pid) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  });

  async function get(path: string, headers?: Record<string, string>) {
    const response = await fetch(`${baseUrl}${path}`, { headers, redirect: "manual" });
    const body = await response.text();
    return { status: response.status, body };
  }

  it("returns 401 and the sign-in page for an unsigned desk", async () => {
    for (const path of ["/projects", "/changes"]) {
      const response = await get(path);
      expect(response.status, `${path}\n${logs}`).toBe(401);
      expect(response.body).toContain("Sign in to open this desk.");
      expect(response.body).toContain("/login");
    }
  });

  it("ignores a forged user header when the trust switch is off", async () => {
    const response = await get("/projects", { "x-user-id": "user_forged" });
    expect(response.status).toBe(401);
    expect(response.body).toContain("Sign in to open this desk.");
  });

  it("leaves the login page at 200", async () => {
    const response = await get("/login");
    expect(response.status).toBe(200);
    expect(response.body).toContain("Sign in");
  });
});

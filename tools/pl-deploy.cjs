// Deploy the repo to Vercel via the REST API (the Vercel CLI was broken on the
// original dev machine — a Windows npm optional-deps bug, "Cannot find native
// binding"). Uploads every git-tracked file, creates a PRODUCTION deployment
// that builds using vercel.json, polls until READY/ERROR, prints the URL.
//
// Usage (PowerShell / bash):
//   VERCEL_TOKEN="<token>" VERCEL_TEAM="<team-id>" node tools/pl-deploy.cjs
//
// The token + team id are in HANDOFF.secrets.md (kept out of git). Generate a
// token at vercel.com -> Settings -> Tokens. If the Vercel CLI works on your
// machine, `vercel --prod` is simpler — this script is the fallback.
const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const { execSync } = require("child_process");

const TOKEN = process.env.VERCEL_TOKEN;
const TEAM = process.env.VERCEL_TEAM; // team id
const NAME = "powerline";
if (!TOKEN || !TEAM) {
  console.error("missing VERCEL_TOKEN or VERCEL_TEAM");
  process.exit(1);
}

function api(method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      "https://api.vercel.com" + path,
      { method, headers },
      (res) => {
        const d = [];
        res.on("data", (c) => d.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(d).toString() })
        );
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const files = execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`uploading ${files.length} files...`);
  const manifest = [];
  for (const f of files) {
    const buf = fs.readFileSync(f);
    const sha = crypto.createHash("sha1").update(buf).digest("hex");
    manifest.push({ file: f.replace(/\\/g, "/"), sha, size: buf.length });
    const up = await api(
      "POST",
      `/v2/files?teamId=${TEAM}`,
      {
        Authorization: "Bearer " + TOKEN,
        "Content-Type": "application/octet-stream",
        "x-vercel-digest": sha,
        "Content-Length": buf.length,
      },
      buf
    );
    if (up.status !== 200 && up.status !== 201) {
      console.error("UPLOAD FAIL", f, up.status, up.body.slice(0, 200));
      process.exit(1);
    }
  }
  console.log("uploads done. creating deployment...");

  const payload = JSON.stringify({
    name: NAME,
    target: "production",
    files: manifest,
    projectSettings: { framework: null },
  });
  const dep = await api(
    "POST",
    `/v13/deployments?teamId=${TEAM}&forceNew=1&skipAutoDetectionConfirmation=1`,
    {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
    payload
  );
  let j;
  try {
    j = JSON.parse(dep.body);
  } catch {
    console.error("deployment create response:", dep.status, dep.body.slice(0, 600));
    process.exit(1);
  }
  if (dep.status >= 400) {
    console.error("DEPLOY CREATE ERROR", dep.status, JSON.stringify(j).slice(0, 600));
    process.exit(1);
  }
  const id = j.id;
  console.log("deployment id:", id, "url:", j.url);

  // poll
  for (let i = 0; i < 80; i++) {
    await sleep(5000);
    const st = await api("GET", `/v13/deployments/${id}?teamId=${TEAM}`, {
      Authorization: "Bearer " + TOKEN,
    });
    let s;
    try {
      s = JSON.parse(st.body);
    } catch {
      continue;
    }
    const state = s.readyState || s.status;
    process.stdout.write(`  [${i}] ${state}\n`);
    if (state === "READY") {
      console.log("READY  https://" + (s.alias && s.alias[0] ? s.alias[0] : s.url));
      console.log("primary url: https://" + s.url);
      process.exit(0);
    }
    if (state === "ERROR" || state === "CANCELED") {
      console.error("BUILD " + state);
      const ev = await api(
        "GET",
        `/v2/deployments/${id}/events?teamId=${TEAM}&builds=1&limit=60`,
        { Authorization: "Bearer " + TOKEN }
      );
      console.error(ev.body.slice(-2500));
      process.exit(1);
    }
  }
  console.error("timed out waiting for build");
  process.exit(1);
})();

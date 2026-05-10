const owner = process.env.GITHUB_OWNER || "didi1119";
const repo = process.env.GITHUB_REPO || "birth";
const branch = process.env.GITHUB_BRANCH || "main";
const path = process.env.ROSTER_FILE_PATH || "data/roster.json";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    return getRoster(req, res);
  }

  if (req.method === "POST") {
    return saveRoster(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
};

async function getRoster(req, res) {
  try {
    const file = await getGithubFile();
    if (!file) {
      return res.status(200).json({ hasRoster: false });
    }

    const json = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
    return res.status(200).json({ hasRoster: true, roster: json });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function saveRoster(req, res) {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const githubToken = process.env.GITHUB_TOKEN;

    if (!adminPassword || !githubToken) {
      return res.status(500).json({ error: "Server is missing ADMIN_PASSWORD or GITHUB_TOKEN." });
    }

    const body = await readBody(req);
    if (body.password !== adminPassword) {
      return res.status(401).json({ error: "主管密碼不正確。" });
    }

    const payload = body.payload;
    validatePayload(payload);

    const existing = await getGithubFile();
    const content = Buffer.from(JSON.stringify(payload, null, 2), "utf8").toString("base64");
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
      method: "PUT",
      headers: githubHeaders(githubToken),
      body: JSON.stringify({
        message: `Update published roster: ${payload.sourceName || "schedule"}`,
        content,
        branch,
        sha: existing?.sha,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || "GitHub update failed." });
    }

    return res.status(200).json({
      ok: true,
      commit: data.commit?.sha,
      url: data.content?.html_url,
      updatedAt: payload.publishedAt,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function getGithubFile() {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`, {
    headers: githubHeaders(token),
  });

  if (response.status === 404) return null;
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "GitHub read failed.");
  }
  return data;
}

function githubHeaders(token) {
  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "birth-roster-dashboard",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Missing roster payload.");
  if (!Array.isArray(payload.shifts)) throw new Error("Roster payload must include shifts.");
  if (!Array.isArray(payload.employees)) throw new Error("Roster payload must include employees.");
  if (payload.shifts.length > 5000) throw new Error("Roster is too large.");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

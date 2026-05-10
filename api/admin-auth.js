module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return res.status(500).json({ error: "Server is missing ADMIN_PASSWORD." });
    }

    const body = await readBody(req);
    if (body.password !== adminPassword) {
      return res.status(401).json({ ok: false, error: "主管密碼不正確。" });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 64) reject(new Error("Request body is too large."));
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

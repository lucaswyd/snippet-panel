import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false,
  },
};

type FastFileEntry = {
  title?: string;
  oldname?: string;
  extension?: string;
};

type FastFileResponse = {
  isSuccess?: boolean;
  files?: FastFileEntry[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({
    maxFileSize: 500 * 1024 * 1024,
    keepExtensions: true,
  });

  let parsed: [formidable.Fields, formidable.Files];
  try {
    parsed = await form.parse(req);
  } catch {
    return res.status(400).json({ error: "Invalid form data" });
  }

  const [, files] = parsed;
  const raw = files.file;
  const file = Array.isArray(raw) ? raw[0] : raw;
  if (!file) {
    return res.status(400).json({ error: "Missing file field" });
  }

  const buf = fs.readFileSync(file.filepath);
  const originalName =
    typeof file.originalFilename === "string"
      ? file.originalFilename
      : "upload.bin";

  try {
    fs.unlinkSync(file.filepath);
  } catch {
    /* temp cleanup */
  }

  const fd = new FormData();
  fd.append("files", new Blob([buf]), originalName);

  let upstream: Response;
  try {
    upstream = await fetch("https://fast-file.com/upload", {
      method: "POST",
      body: fd,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return res.status(502).json({ error: msg });
  }

  if (upstream.status === 413) {
    return res.status(413).json({ error: "DISCORD_UPLOAD_NEEDED" });
  }

  if (!upstream.ok) {
    const t = await upstream.text();
    return res.status(upstream.status).json({ error: t || "Upload failed" });
  }

  let json: FastFileResponse;
  try {
    json = (await upstream.json()) as FastFileResponse;
  } catch {
    return res.status(502).json({ error: "Invalid response from host" });
  }

  const list = json.files ?? [];
  const out = list.map((f) => {
    const title = f.title ?? "";
    const page = title ? `https://fast-file.com/${title}` : "";
    const downloadUrl = title ? `https://fast-file.com/${title}/download` : "";
    return { url: page, downloadUrl };
  });

  return res.status(200).json({ files: out });
}

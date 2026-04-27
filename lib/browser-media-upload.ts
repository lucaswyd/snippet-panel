export type UploadResult = {
  name: string;
  size: number;
  downloadUrl?: string;
  error?: string;
  needsDiscordUpload?: boolean;
};

const FAST_FILE_UPLOAD = "https://fast-file.com/upload";
const PROXY_MAX_BYTES = 4 * 1024 * 1024;

function downloadUrlFromFastFileJson(text: string): string | undefined {
  try {
    const data = JSON.parse(text) as { files?: { title?: string }[] };
    const title = data.files?.[0]?.title;
    console.log("=== DEBUG: fast-file API response ===");
    console.log("Raw response text:", text);
    console.log("Parsed data:", data);
    console.log("Extracted title:", title);
    if (title) {
      const downloadUrl = `https://fast-file.com/${title}/download`;
      console.log("Constructed downloadUrl:", downloadUrl);
      console.log("=== END DEBUG ===");
      return downloadUrl;
    }
    console.log("No title found, returning undefined");
    console.log("=== END DEBUG ===");
  } catch (e) {
    console.log("=== DEBUG: Failed to parse fast-file response ===");
    console.log("Error:", e);
    console.log("Raw text:", text);
    console.log("=== END DEBUG ===");
    /* ignore */
  }
  return undefined;
}

export async function uploadVideoFile(
  file: File,
  desiredName: string,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  const renamed = new File([file], desiredName, {
    type: file.type || "video/mp4",
    lastModified: file.lastModified,
  });

  const uploadViaVercelProxy = () =>
    new Promise<UploadResult>((resolve) => {
      if (renamed.size > PROXY_MAX_BYTES) {
        resolve({
          name: renamed.name,
          size: renamed.size,
          error:
            "Could not reach fast-file from the browser and file is too large for the server relay (~4MB). Try another network or upload via Discord.",
        });
        return;
      }

      const fd = new FormData();
      fd.append("file", renamed);
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (ev) => {
        if (!ev.lengthComputable || !onProgress) return;
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      });
      xhr.addEventListener("load", () => {
        let data: { error?: string; files?: { downloadUrl?: string }[] } = {};
        try {
          data = JSON.parse(xhr.responseText) as typeof data;
        } catch {
          /* ignore */
        }
        if (xhr.status === 413) {
          resolve({
            name: renamed.name,
            size: renamed.size,
            error:
              data.error === "DISCORD_UPLOAD_NEEDED"
                ? "Too large for fast-file"
                : "File too large for server upload. Direct browser upload should be used — try refreshing.",
            needsDiscordUpload: data.error === "DISCORD_UPLOAD_NEEDED",
          });
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          resolve({
            name: renamed.name,
            size: renamed.size,
            error: data.error || "Upload failed",
          });
          return;
        }
        resolve({
          name: renamed.name,
          size: renamed.size,
          downloadUrl: data.files?.[0]?.downloadUrl,
          error: data.files?.[0]?.downloadUrl ? undefined : "Invalid response",
        });
      });
      xhr.addEventListener("error", () => {
        resolve({
          name: renamed.name,
          size: renamed.size,
          error: "Network error",
        });
      });
      xhr.open("POST", "/api/upload");
      xhr.send(fd);
    });

  return new Promise<UploadResult>((resolve) => {
    const fd = new FormData();
    fd.append("files", renamed, renamed.name);

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (ev) => {
      if (!ev.lengthComputable || !onProgress) return;
      onProgress(Math.round((ev.loaded / ev.total) * 100));
    });
    xhr.addEventListener("load", async () => {
      if (xhr.status === 0) {
        resolve(await uploadViaVercelProxy());
        return;
      }
      if (xhr.status === 413) {
        resolve({
          name: renamed.name,
          size: renamed.size,
          error: "Too large for fast-file",
          needsDiscordUpload: true,
        });
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const downloadUrl = downloadUrlFromFastFileJson(xhr.responseText);
        if (downloadUrl) {
          resolve({
            name: renamed.name,
            size: renamed.size,
            downloadUrl,
          });
          return;
        }
      }
      resolve(await uploadViaVercelProxy());
    });
    xhr.addEventListener("error", async () => {
      resolve(await uploadViaVercelProxy());
    });
    xhr.open("POST", FAST_FILE_UPLOAD);
    xhr.send(fd);
  });
}

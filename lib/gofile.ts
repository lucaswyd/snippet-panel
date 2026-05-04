export async function fetchGofileFiles(contentId: string): Promise<Array<{ name: string; link: string; blob: Blob }>> {
  console.log("Gofile contentId:", contentId);

  const pageRes = await fetch(`https://gofile.io/d/${contentId}`);
  if (!pageRes.ok) {
    throw new Error(`Failed to fetch gofile page: ${pageRes.status}`);
  }

  const html = await pageRes.text();

  // Extract CDN download links from page HTML
  const matches = Array.from(
    html.matchAll(/src="(https:\/\/store-[^"]+gofile\.io\/download\/web\/[^"]+)"/g)
  );

  if (!matches.length) {
    throw new Error("No download links found on Gofile page");
  }

  const files: Array<{ name: string; link: string; blob: Blob }> = [];

  for (const match of matches) {
    const url = match[1];

    // Try to derive filename from URL path
    const parts = url.split("/");
    const rawName = parts[parts.length - 1];
    const name = decodeURIComponent(rawName || "file");

    const blob = await downloadFromGofile(url);

    files.push({
      name,
      link: url,
      blob,
    });
  }

  return files;
}

export async function downloadFromGofile(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download file from Gofile: ${res.status}`);
  }
  return await res.blob();
}

export function isGofileUrl(url: string): boolean {
  return typeof url === "string" && url.includes("gofile.io");
}

export function extractGofileContentId(url: string): string | null {
  try {
    const u = new URL(url);

    // matches https://gofile.io/d/<id>
    const match = u.pathname.match(/\/d\/([a-zA-Z0-9]+)/);
    if (match?.[1]) return match[1];

    return null;
  } catch {
    return null;
  }
}

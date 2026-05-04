interface GofileContentResponse {
  status: string;
  data: {
    contents: Record<string, {
      name: string;
      type: string;
      size: number;
      link: string;
    }>;
  };
}

interface GofileCreateFolderResponse {
  status: string;
  data: {
    id: string;
  };
}

const GOFILE_API_URL = "https://api.gofile.io";

export function getGofileToken(): string {
  return process.env.GOFILE_TOKEN || "";
}

export async function getGofileContent(contentId: string): Promise<GofileContentResponse> {
  const token = getGofileToken();
  const url = `${GOFILE_API_URL}/getContent?contentId=${contentId}${token ? `&token=${token}` : ""}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gofile API error: ${response.status}`);
  }
  
  return response.json();
}

export async function downloadFromGofile(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download from gofile: ${response.status}`);
  }
  return response.blob();
}

export function isGofileUrl(url: string): boolean {
  return url.includes("gofile.io");
}

export function extractGofileContentId(url: string): string | null {
  const match = url.match(/gofile\.io\/d\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export async function fetchGofileFiles(contentId: string): Promise<Array<{ name: string; link: string; blob: Blob }>> {
  const content = await getGofileContent(contentId);
  
  if (content.status !== "ok") {
    throw new Error("Failed to fetch gofile content");
  }
  
  const files: Array<{ name: string; link: string; blob: Blob }> = [];
  
  for (const [fileId, fileInfo] of Object.entries(content.data.contents)) {
    if (fileInfo.type === "file") {
      const blob = await downloadFromGofile(fileInfo.link);
      files.push({
        name: fileInfo.name,
        link: fileInfo.link,
        blob,
      });
    }
  }
  
  return files;
}

import type { NextApiRequest, NextApiResponse } from "next";
import { uploadVideoFileServer } from "@/lib/browser-media-upload";
import {
  isGofileUrl,
  extractGofileContentId,
  fetchGofileFiles,
} from "@/lib/gofile";

type ProcessGofileUrlsBody = {
  urls: string[];
};

type ProcessGofileUrlsResponse = {
  processedUrls: string[];
  gofileUrls: string[];
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: ProcessGofileUrlsBody;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (!Array.isArray(body.urls)) {
    return res.status(400).json({ error: "URLs array required" });
  }

  const processedUrls: string[] = [];
  const gofileUrls: string[] = [];

  for (const url of body.urls) {
    if (isGofileUrl(url)) {
      const contentId = extractGofileContentId(url);
      if (!contentId) {
        console.error(`Could not extract content ID from gofile URL: ${url}`);
        continue;
      }

      try {
        console.log(`Fetching gofile content: ${contentId}`);
        const files = await fetchGofileFiles(contentId);
        
        for (const file of files) {
          console.log(`Uploading ${file.name} to fast-file...`);
          const fileObj = new File([file.blob], file.name, { type: "video/mp4" });
          const result = await uploadVideoFileServer(fileObj, file.name);

          if (result.downloadUrl) {
            processedUrls.push(result.downloadUrl);
            gofileUrls.push(url);
          } else {
            console.error(`Failed to upload ${file.name}:`, result.error);
          }
        }
      } catch (e) {
        console.error(`Error processing gofile URL ${url}:`, e);
        return res.status(500).json({ 
          error: `Failed to process gofile URL: ${url}`,
          details: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      // Not a gofile URL, keep as-is
      processedUrls.push(url);
    }
  }

  return res.status(200).json({ 
    processedUrls,
    gofileUrls,
  });
}

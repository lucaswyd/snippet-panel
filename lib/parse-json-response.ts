/** Safari/WebKit: `response.json()` on HTML error bodies throws "The string did not match the expected pattern." */
export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.trimStart().slice(0, 200).replace(/\s+/g, " ");
    const isHtml =
      preview.startsWith("<!") || preview.toLowerCase().startsWith("<html");
    throw new Error(
      isHtml
        ? `Request failed (${res.status}). Server returned HTML — usually a timeout or gateway error.`
        : `Invalid JSON (${res.status}): ${preview}`
    );
  }
}

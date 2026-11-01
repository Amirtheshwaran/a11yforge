/** Accept ordinary pasted addresses while retaining the API's stricter target checks. */
export function normalizeWebsiteUrl(input: string): string {
  const value = input.trim();
  if (value === "") throw new Error("Enter a website address to check.");
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  const hostAndPort = /^([^/?#:\s]+):\d+(?:[/?#]|$)/.exec(value);
  const hostWithPort = hostAndPort !== null && (hostAndPort[1]?.includes(".") === true || hostAndPort[1]?.toLowerCase() === "localhost");
  const candidate = value.startsWith("//") ? `https:${value}` : !hasScheme || hostWithPort ? `https://${value}` : value;
  let url: URL;
  try { url = new URL(candidate); }
  catch { throw new Error("Enter a valid website address, such as https://yourwebsite.com."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use an http:// or https:// website address.");
  if (url.username !== "" || url.password !== "") throw new Error("Use a website address without a username or password.");
  return url.href;
}

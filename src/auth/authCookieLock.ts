/** Serialize cookie rotations across tabs without sharing credentials through storage or messages. */
export async function runAuthCookieRequest<T>(action: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return await (locks ? locks.request("meetme-refresh", action) : action());
}

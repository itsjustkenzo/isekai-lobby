export async function api(path, options) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

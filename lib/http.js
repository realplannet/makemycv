/** Small response helpers shared by every Pages Functions route. */

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Parses the JSON body of a request; returns {} on empty/invalid body instead of throwing. */
export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function queryParams(request) {
  return new URL(request.url).searchParams;
}

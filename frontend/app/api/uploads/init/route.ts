export async function POST(req: Request) {
  const { name = "file", bucket = "default" } = await req.json().catch(() => ({}))
  const uploadId = Math.random().toString(36).slice(2)
  const sseUrl = `/api/uploads/${uploadId}/events`
  return Response.json({ uploadId, sseUrl, name, bucket })
}

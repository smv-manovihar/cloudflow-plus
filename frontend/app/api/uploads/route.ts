export async function POST(req: Request) {
  // In a real app you'd parse the FormData and forward to storage.
  // This simulates a small processing delay.
  const ctype = req.headers.get("content-type") || ""
  if (ctype.includes("multipart/form-data")) {
    // consume body to avoid stream locking
    await req.formData()
  } else {
    await req.arrayBuffer()
  }
  await new Promise((r) => setTimeout(r, 400))
  return Response.json({ ok: true })
}

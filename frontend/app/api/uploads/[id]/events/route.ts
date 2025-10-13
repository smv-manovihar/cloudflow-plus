export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      let percent = 0
      const timer = setInterval(() => {
        percent = Math.min(100, percent + Math.ceil(Math.random() * 12))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ percent, state: "uploading" })}\n\n`))
        if (percent >= 100) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ percent: 100, state: "complete" })}\n\n`))
          clearInterval(timer)
          controller.close()
        }
      }, 500)
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

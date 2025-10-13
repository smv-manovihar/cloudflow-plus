# main.py
import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

# 1. Create an AsyncServer instance
# The async_mode='asgi' is crucial for integration with FastAPI.
# We enable CORS for all origins ('*') for easier development.
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# 2. Create a FastAPI instance
# This app will handle standard HTTP routes.
app = FastAPI()

# 3. Wrap the FastAPI app with the Socket.IO server
# This creates a single ASGI application that can handle both HTTP and WebSocket traffic.
# The `socketio_path` argument specifies the endpoint for Socket.IO connections.
combined_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="socket.io")


# (Optional) Add a standard FastAPI route to serve the client-side HTML
@app.get("/")
async def read_root():
    # A simple HTML response to serve the client-side code
    with open("index.html") as f:
        return HTMLResponse(f.read())


# 4. Define Socket.IO event handlers
# Handlers are defined using the `@sio.event` or `@sio.on()` decorators.
# These must be `async` functions.


@sio.event
async def connect(sid, environ):
    """
    Handles a new client connection.
    - sid: A unique session ID for the connection.
    - environ: A dictionary containing the WSGI/ASGI environment.
    """
    print(f"✅ Client connected: {sid}")
    # You can send a welcome message to the connected client
    await sio.emit("response", {"data": f"Welcome! Your SID is {sid}"}, to=sid)


@sio.on("message_from_client")
async def message_from_client(sid, data):
    """
    Handles a custom event named 'message_from_client'.
    - data: The payload sent by the client.
    """
    print(f"📩 Message from {sid}: {data}")
    # Emit a response back to the client who sent the message
    await sio.emit("response", {"data": f"Server received: '{data}'"}, to=sid)


@sio.event
async def disconnect(sid):
    """
    Handles a client disconnection.
    """
    print(f"❌ Client disconnected: {sid}")

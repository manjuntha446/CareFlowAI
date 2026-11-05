// Lightweight in-memory Server-Sent Events (SSE) broadcast hub.
// Pushes a "queue-updated" ping to open dashboards / waiting screens so they
// refetch automatically without the user manually refreshing the page.
// No sensitive data is ever transmitted over this stream.

const clients = new Set();

const sseHandler = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(': connected\n\n');
  clients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (_) {
      clearInterval(heartbeat);
      clients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
};

const notifyUpdate = (eventName = 'queue-updated') => {
  const message = `event: ${eventName}\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`;
  for (const res of clients) {
    try {
      res.write(message);
    } catch (_) {
      clients.delete(res);
    }
  }
};

module.exports = { sseHandler, notifyUpdate };
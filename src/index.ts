export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "FlightDeck API",
        version: "0.1.0"
      });
    }

    return Response.json(
      {
        error: "Not Found",
        message: "FlightDeck API route not found"
      },
      { status: 404 }
    );
  }
};
import http from "node:http";

const port = Number(process.env.PORT ?? "8080");

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }

  response.writeHead(501, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      error: "not_implemented",
      message: "Mosaic generator runtime is not wired yet.",
    }),
  );
});

server.listen(port, "0.0.0.0");

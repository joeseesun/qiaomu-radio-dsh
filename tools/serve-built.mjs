import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT ?? process.argv[2] ?? 4190);

const { apply, name, resolveAssetDirectory } = await import(join(root, "lib/index.js"));

const routes = [];
const webServer = {
  host: "127.0.0.1",
  port,
  register(route) {
    routes.push(route);
    return () => {
      const at = routes.indexOf(route);
      if (at >= 0) routes.splice(at, 1);
    };
  },
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const prefix = routes
    .filter((route) => route.kind === "prefix" && url.pathname.startsWith(route.path))
    .sort((left, right) => right.path.length - left.path.length)[0];
  const exact = routes.find((route) => route.kind === "exact" && route.path === url.pathname);
  const route = exact ?? prefix;
  if (!route) {
    response.statusCode = 404;
    response.end("not found");
    return;
  }
  await route.handler(request, response);
});

const assetDirectory = resolveAssetDirectory();
if (!existsSync(assetDirectory)) {
  console.error(`asset directory missing: ${assetDirectory}`);
  process.exit(1);
}

const ctx = { webServer, logger: { info: (m) => console.log("[info]", m), warn: (m) => console.warn("[warn]", m) } };
apply(ctx, { assetDir: assetDirectory });

server.listen(port, "127.0.0.1", () => {
  console.log(`${name} serving the built plugin at http://127.0.0.1:${port}/qiaomu-radio/`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
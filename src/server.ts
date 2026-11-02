import app from "./app";
import { startGuestCartCleanup } from "./app/modules/cart/cart.cleanup";
const stopGuestCartCleanup = startGuestCartCleanup();

const port = Number(process.env.PORT ?? 5000);

const server = app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

function shutdown(signal: string) {
  stopGuestCartCleanup();
  console.log(`${signal} received. Shutting down server...`);

  server.close((error) => {
    if (error) {
      console.error("Error while shutting down:", error);
      process.exitCode = 1;
      return;
    }

    process.exitCode = 0;
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

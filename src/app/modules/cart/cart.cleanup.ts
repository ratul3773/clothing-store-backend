import { CartMergeService } from "./cart.merge.service";

export const startGuestCartCleanup = () => {
  let running = false;
  const clean = async () => {
    if (running) return;
    running = true;
    try {
      await CartMergeService.cleanup();
    } catch {
      console.error(
        "Guest cart cleanup failed; it will retry on the next daily run",
      );
    } finally {
      running = false;
    }
  };
  const timer = setInterval(
    () => {
      void clean();
    },
    24 * 60 * 60_000,
  );
  timer.unref();
  void clean();
  return () => clearInterval(timer);
};

import { OrderService } from "./order.service";

export const startOrderCleanup = () => {
  let running = false;
  const clean = async () => {
    if (running) return;
    running = true;
    try {
      await OrderService.expirePendingOrders();
    } catch {
      console.error("Order expiry cleanup failed; retrying on the next minute");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void clean(); }, 60_000);
  timer.unref();
  void clean();
  return () => clearInterval(timer);
};

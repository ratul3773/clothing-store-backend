import { createAuthMiddleware } from "better-auth/api";
import { cartCookieAttributes } from "./cart.cookie";
import { CART_COOKIE_NAME } from "./cart.constants";
import { CartMergeService } from "./cart.merge.service";
import { CartMergeReport } from "./cart.interface";

export const cartAfterAuth = createAuthMiddleware(async (ctx) => {
  const session = ctx.context.newSession;
  if (!session || session.user.role !== "customer") return;
  const token = ctx.getCookie(CART_COOKIE_NAME);
  if (!token) return;
  const cartMerge = await CartMergeService.merge(session.user.id, token);
  // Better Auth maxAge is seconds. Express res.cookie maxAge is milliseconds.
  ctx.setCookie(CART_COOKIE_NAME, "", { ...cartCookieAttributes, maxAge: 0 });
  const returned: unknown = ctx.context.returned;
  if (
    returned &&
    typeof returned === "object" &&
    !(returned instanceof Response)
  )
    ctx.context.returned = { ...returned, cartMerge };
});

// Custom Express auth wrappers preserve the same additive response metadata.
export const cartMergeFromResponse = (
  response: unknown,
): CartMergeReport | undefined => {
  if (!response || typeof response !== "object" || !("cartMerge" in response))
    return undefined;
  const report = response.cartMerge;
  if (
    !report ||
    typeof report !== "object" ||
    !("merged" in report) ||
    !("adjustments" in report) ||
    typeof report.merged !== "boolean" ||
    !Array.isArray(report.adjustments)
  )
    return undefined;
  return report as CartMergeReport;
};

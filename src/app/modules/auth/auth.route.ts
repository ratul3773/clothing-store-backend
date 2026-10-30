import { Router } from "express";
import { AuthController } from "./auth.controller";
import validateRequest from "../../middlewares/validateRequest";
import { AuthValidation } from "./auth.validation";
import { authLimiter } from "../../middlewares/security";
import { requireTrustedOrigin } from "../../middlewares/originGuard";

const router = Router();

router.use(authLimiter, requireTrustedOrigin);

router.post(
  "/register",
  validateRequest(AuthValidation.registerUserSchema),
  AuthController.RegisterUser,
);
router.post(
  "/verify-email",
  validateRequest(AuthValidation.verifyEmailValidationSchema),
  AuthController.verifyEmail,
);
router.post(
  "/login",
  validateRequest(AuthValidation.loginValidationSchema),
  AuthController.LoginUser,
);

export const AuthRoutes = router;

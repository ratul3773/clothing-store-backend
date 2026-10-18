import { Router } from "express";
import { AuthController } from "./auth.controller";
import validateRequest from "../../middlewares/validateRequest";
import { AuthValidation } from "./auth.validation";

const router = Router();

router.post(
    "/register",
    validateRequest(AuthValidation.registerUserSchema),
    AuthController.RegisterUser
);
router.post(
    "/verify-email",
    validateRequest(AuthValidation.verifyEmailValidationSchema),
    AuthController.verifyEmail
);
router.post(
    "/login",
    validateRequest(AuthValidation.loginValidationSchema),
    AuthController.LoginUser
);
export const AuthRoutes = router;
import { Router } from "express";
import { AuthController } from "./auth.controller";

const router = Router();

router.post("/register",AuthController.RegisterUser);
router.post("/verify-email",AuthController.verifyEmail);
router.post("/login",AuthController.LoginUser);
export const AuthRoutes = router;
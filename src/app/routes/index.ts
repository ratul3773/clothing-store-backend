import { Router } from "express";
import { AuthRoutes } from "../modules/auth/auth.route";
import { AdminCategoryRoutes } from "../modules/category/admin-category.route";
import { CategoryRoutes } from "../modules/category/category.route";
import { AdminProductRoutes } from "../modules/product/admin-product.route";
import { ProductRoutes } from "../modules/product/product.route";

const router = Router();

router.use("/auth", AuthRoutes);
router.use("/categories", CategoryRoutes);
router.use("/products", ProductRoutes);
router.use("/admin/categories", AdminCategoryRoutes);
router.use("/admin/products", AdminProductRoutes);

export default router;
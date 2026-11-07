import { Router } from "express";
import { AuthRoutes } from "../modules/auth/auth.route";
import { AdminCategoryRoutes } from "../modules/category/admin-category.route";
import { CategoryRoutes } from "../modules/category/category.route";
import { AdminProductRoutes } from "../modules/product/admin-product.route";
import { ProductRoutes } from "../modules/product/product.route";
import { CartRoutes } from "../modules/cart/cart.route";
import { ComboRoutes, AdminComboRoutes } from "../modules/combo/combo.route";
import { AddressRoutes } from "../modules/address/address.route";
import { requireTrustedOrigin } from "../middlewares/originGuard";

const router = Router();
router.use(requireTrustedOrigin);
router.use("/auth", AuthRoutes);
router.use("/categories", CategoryRoutes);
router.use("/products", ProductRoutes);
router.use("/cart", CartRoutes);
router.use("/combos", ComboRoutes);
router.use("/admin/combos", AdminComboRoutes);
router.use("/admin/categories", AdminCategoryRoutes);
router.use("/admin/products", AdminProductRoutes);
router.use("/addresses", AddressRoutes);

export default router;
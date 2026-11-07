import { Router } from "express";
import { AddressController } from "./address.controller";
import { AddressValidation } from "./address.validation";
import validateRequest from "../../middlewares/validateRequest";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { Role } from "../../../generated/prisma/enums";
import { requireTrustedOrigin } from "../../middlewares/originGuard";

const router = Router();

router.use(requireAuth , requireRole(Role.customer));
router.get("/", AddressController.getAddresses);
router.post(
  "/",
  validateRequest(AddressValidation.createAddressSchema),
  AddressController.addAddress,
);
router.patch(
  "/:addressId",
  validateRequest(AddressValidation.updateAddressSchema),
  AddressController.updateAddress,
);
router.delete(
  "/:addressId",
  validateRequest(AddressValidation.addressIdSchema),
  AddressController.deleteAddress,
);

export const AddressRoutes = router;

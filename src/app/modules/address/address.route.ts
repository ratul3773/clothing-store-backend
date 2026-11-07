import { Router } from "express";
import { AddressController } from "./address.controller";
import { AddressValidation } from "./address.validation";
import validateRequest from "../../middlewares/validateRequest";

const router = Router();

router.get("/", AddressController.getAddresses);
router.post(
  "/",
  validateRequest(AddressValidation.createAddressSchema),
  AddressController.addAddress,
);
router.get(
  "/:addressId",
  validateRequest(AddressValidation.getAddressByIdSchema),
  AddressController.getAddresses,
);
router.patch(
  "/:addressId",
  validateRequest(AddressValidation.updateAddressSchema),
  AddressController.updateAddress,
);
router.delete(
  "/:addressId",
  validateRequest(AddressValidation.deleteAddressSchema),
  AddressController.deleteAddress,
);

export const AddressRoutes = router;

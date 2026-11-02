import { z } from "zod";
import { ComboValidation } from "./combo.validation";

export type CreateComboInput = z.infer<typeof ComboValidation.create>["body"];
export type UpdateComboInput = z.infer<typeof ComboValidation.update>["body"];

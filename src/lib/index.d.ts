import { JwtPayload } from "jsonwebtoken";
import { SellerStatus } from "../generated/prisma/enums";

declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        role: string;
        email: string;
        emailVerified: boolean;
      };
    }
  }
}

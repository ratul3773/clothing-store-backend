import { User } from "../../../generated/prisma/client";
import { CartMergeReport } from "../cart/cart.interface";

export interface IRegisterUser {
  name: string;
  email: string;
  password: string;
  phone: string;
}

export interface ILogin {
  email: string;
  password: string;
}

export type IAuthResponse = Partial<User>;

export type AuthResult = {
  data: IAuthResponse;
  headers: Headers;
  cartMerge?: CartMergeReport | undefined;
};

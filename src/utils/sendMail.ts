import path from "path";
import ejs from "ejs";
import httpStatus from "http-status";
import ApiError from "../errors/ApiError";
import config from "../config/env";
import { transporter } from "./transporter";

interface SendMailOptions {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

export const sendMail = async ({
  to,
  subject,
  template,
  data,
}: SendMailOptions) => {
  const port = Number(config.smtp.port);
  if (
    !config.smtp.host ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !config.smtp.user ||
    !config.smtp.pass ||
    !config.smtp.email_from
  ) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      "Email delivery is not configured"
    );
  }

  try {
    const html = await ejs.renderFile(
      process.env.NODE_ENV === "development"
        ? path.join(process.cwd(), "src/utils/templates", `${template}.ejs`)
        : path.join(process.cwd(), "dist/utils/templates", `${template}.ejs`),
      {
        appName: "Clothing Store",
        year: new Date().getFullYear(),
        ...data,
      }
    );
    await transporter.sendMail({
      from: config.smtp.email_from,
      to,
      subject,
      html,
    });
  } catch {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to send email"
    );
  }
};
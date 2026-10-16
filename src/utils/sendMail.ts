
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

  let html: string;

  try {
    const templatePath = path.join(
      process.cwd(),
      config.env === "development"
        ? "src/utils/templates"
        : "dist/utils/templates",
      `${template}.ejs`
    );

    html = await ejs.renderFile(templatePath, {
      appName: "Clothing Store",
      year: new Date().getFullYear(),
      ...data,
    });
  } catch (error) {
    console.error("[EMAIL] Template rendering failed:", error);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to render email template"
    );
  }

  try {
    await transporter.sendMail({
      from: config.smtp.email_from,
      to,
      subject,
      html,
    });

    console.info("[EMAIL] Email sent successfully.");
  } catch (error) {
    // Log the underlying error, but never log SMTP credentials or OTPs.
    console.error("[EMAIL] SMTP delivery failed:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to send email"
    );
  }
};

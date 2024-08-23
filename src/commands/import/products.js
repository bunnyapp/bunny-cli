import { Command } from "commander";
import { promises as fs } from "fs";
import { confirm } from "@inquirer/prompts";
import ora from "ora";
import chalk from "chalk";
import client from "../../lib/client.js";
import productImport from "../../lib/mutations/product-import.js";

const importProducts = new Command("products")
  .description("Import products in bulk from a json file")
  .option("-f, --file <path>", "Import file path")
  .action(async (options) => {
    // const destinationSubdomain = await input({
    //   message: "Enter a subdomain for the destination Bunny instance",
    // });
    // const destinationAccessToken = await input({
    //   message: "Enter an access token for the destination Bunny instance",
    // });
    let products;
    if (options.file) {
      try {
        const content = await fs.readFile(options.file, "utf8");
        products = JSON.parse(content);
      } catch (error) {
        console.error(chalk.red("Error reading file:", error.message));
        process.exit(1);
      }
    } else {
      console.error(
        chalk.red("Please provide a file path using the -f or --file option.")
      );
      process.exit(1);
    }

    const destinationClient = client(
      "https://bunny.bunny.internal",
      "eyJraWQiOiJ6Yzhvc1N1VDJCRGxjbXBISWxlamxJZHBoa24xMW50RlN6MEtGTGc1R3JnIiwiYWxnIjoiSFM1MTIifQ.eyJpc3MiOiJJbXBvcnQgQ2xpZW50IiwiaWF0IjoxNzIzODMzMzAzLCJqdGkiOiIwYzA0MjY2ZC04YTQ5LTQ3ODQtOGRlYS0yNGQ2NmJhMmMyMDMiLCJjbGllbnRfaWQiOiJ6Yzhvc1N1VDJCRGxjbXBISWxlamxJZHBoa24xMW50RlN6MEtGTGc1R3JnIiwiYXVkIjoiaHR0cHM6Ly9idW5ueS5pbnRlcm5hbCIsImV4cCI6MTczMTAzMzMwMywic2NvcGUiOiJzZWN1cml0eTpyZWFkIHNlY3VyaXR5OndyaXRlIGFkbWluOnJlYWQgYWRtaW46d3JpdGUgb3duZXI6cmVhZCBvd25lcjp3cml0ZSBzdGFuZGFyZDpyZWFkIHN0YW5kYXJkOndyaXRlIHF1b3Rpbmc6cmVhZCBxdW90aW5nOndyaXRlIHByb2R1Y3Q6cmVhZCBwcm9kdWN0OndyaXRlIHdvcmtmbG93OnJlYWQgd29ya2Zsb3c6d3JpdGUgZGV2ZWxvcGVyOnJlYWQgZGV2ZWxvcGVyOndyaXRlIG9wZW5pZCBiaWxsaW5nOnJlYWQgYmlsbGluZzp3cml0ZSBhbmFseXRpY3M6cmVhZCBhbmFseXRpY3M6d3JpdGUgbGVnZW5kYXJ5OnJlYWQgbGVnZW5kYXJ5OndyaXRlIHBsYXRmb3JtOnJlYWQgcGxhdGZvcm06d3JpdGUgcG9ydGFsOndyaXRlIHBvcnRhbDpyZWFkIiwic3ViIjoiYzYxMGQ5MWEtZDBkNS00NDEyLWJlMTYtZDM1ZDI2NWY5NGFkIiwic3ViX3R5cGUiOiJVc2VyIiwiYWN0b3JfZGlzcGxheV9hcyI6eyJpZCI6MSwidHlwZSI6IkFwaUNsaWVudCJ9fQ.BMAAbvKd5knBzPIBOYfRpMIPK07vFH9QEGZe2v9SSNJvJul0XRfhqat88Mv5PaVLs8gP760ntlc2rYe-ymonCQ"
    );

    const confirmed = await confirm({
      message: "Are you sure you want to do this?",
    });

    if (!confirmed) {
      console.log(chalk.red("Ok, import canceled"));
      return;
    }

    let spinner = ora(`Importing products `).start();
    const importResults = await productImport(destinationClient, products);
    importResults.status == "success" ? spinner.succeed() : spinner.fail();
  });

export default importProducts;

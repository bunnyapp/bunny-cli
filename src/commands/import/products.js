import { Command } from "commander";
import { promises as fs } from "fs";
import { confirm } from "@inquirer/prompts";
import ora from "ora";
import chalk from "chalk";
import Conf from "conf";
import client from "../../lib/client.js";
import productImport from "../../lib/mutations/product-import.js";

const config = new Conf({ projectName: "bunny-cli" });

const importProducts = new Command("products")
  .description("Import products in bulk from a json file")
  .option("-f, --file <path>", "Import file path")
  .option("-p, --profile <name>", "Profile name", "default")
  .option("-v, --verbose", "Show verbose output")
  .action(async (options) => {
    let products;
    if (options.file) {
      try {
        const content = await fs.readFile(options.file, "utf8");
        products = JSON.parse(content);
        if (options.verbose) {
          console.log(chalk.blue("\nImporting the following:"));
          console.log(chalk.gray("Profile:", options.profile));
          console.log(chalk.gray("File path:", options.file));
          console.log(
            chalk.gray("Products to import:", products.products?.length || 0)
          );
        }
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

    const profile = config.get(`profiles.${options.profile}`);
    if (!profile) {
      console.error(
        chalk.red(
          `Profile '${options.profile}' not found run "bunny configure".`
        )
      );
      process.exit(1);
    }

    const destinationClient = client(
      profile.baseUrl,
      profile.clientId,
      profile.clientSecret
    );

    const confirmed = await confirm({
      message: "Are you sure you want to do this?",
    });

    if (!confirmed) {
      console.log(chalk.red("Ok, import canceled"));
      return;
    }

    let spinner = ora(`Importing products `).start();
    try {
      if (options.verbose) {
        console.log(chalk.blue("\nSending to API:"));
        console.log(chalk.gray(JSON.stringify(products, null, 2)));
      }

      const importResults = await productImport(destinationClient, products);

      if (importResults?.status === "success") {
        spinner.succeed("Products imported successfully");
      } else {
        spinner.fail("Failed to import products");
        throw new Error(importResults?.message);
      }
    } catch (error) {
      spinner.fail("Failed to import products");
      const errorMessage = error?.message || "Unknown error occurred";
      console.error(chalk.red("\nImport error:"));
      console.error(chalk.red(errorMessage));

      if (options.verbose) {
        console.log(chalk.yellow("\nDebug information:"));
        console.log(chalk.gray("Profile:", options.profile));
        console.log(chalk.gray("File:", options.file));
        console.log(chalk.gray("\nImport data:"));
        console.log(chalk.gray(JSON.stringify(products, null, 2)));
        if (error.stack) {
          console.log(chalk.gray("\nStack trace:"));
          console.log(chalk.gray(error.stack));
        }
      }

      process.exit(1);
    }
  });

export default importProducts;

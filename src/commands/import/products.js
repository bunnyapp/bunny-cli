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
  .action(async (options) => {
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
    const importResults = await productImport(destinationClient, products);
    importResults?.status == "success" ? spinner.succeed() : spinner.fail();
  });

export default importProducts;

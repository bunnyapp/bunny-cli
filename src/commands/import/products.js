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

    const destinationClient = client("https://bunny.bunny.internal", "xxx");

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

import { Command } from "commander";
import fs from "fs";
import { confirm } from "@inquirer/prompts";
import ora from "ora";
import Conf from "conf";
import chalk from "chalk";
import client from "../../lib/client.js";
import mrrImport from "../../lib/mutations/mrr-import.js";

const config = new Conf({ projectName: "bunny-cli" });

const loadFile = async (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        console.error("Error reading CSV file:", err);
        reject(err);
        return;
      }

      resolve(data);
    });
  });
};

const saveSourceToFile = (filePath, data) => {
  fs.writeFile(filePath, data, "utf8", (err) => {
    if (err) {
      console.error("Error writing to file:", err);
      return;
    }
    console.log(`Data has been saved to ${filePath}`);
  });
};

const importMRR = new Command("mrr")
  .description("Import legacy MRR in bulk from a csv file")
  .option("-f, --file <path>", "Import file path")
  .option("-p, --profile <name>", "Profile name", "default")
  .action(async (options) => {
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

    let spinner = ora(`Importing MRR `).start();

    try {
      const csvData = await loadFile(options.file);

      const importResults = await mrrImport(destinationClient, csvData);
      importResults ? spinner.succeed() : spinner.fail();
    } catch (err) {
      spinner.fail();
      console.error("Failed to load file as JSON:", err);
    }
  });

export default importMRR;

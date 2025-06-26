import { Command } from "commander";
import Conf from "conf";
import chalk from "chalk";
import inspectProfile from "./profiles/inspect.js";

const config = new Conf({ projectName: "bunny-cli" });

const listProfiles = new Command("list")
  .description("List all configuration profiles by name")
  .action(() => {
    const profiles = config.get("profiles");
    if (!profiles) {
      console.log(chalk.red("No profiles found."));
      return;
    }

    console.log(chalk.green("Configuration Profiles:"));
    Object.keys(profiles).forEach((profileName) => {
      console.log(`- ${profileName}`);
    });
  });

const profiles = new Command("profiles")
  .description("Manage Bunny CLI profiles")
  .addCommand(listProfiles)
  .addCommand(inspectProfile);

export default profiles;

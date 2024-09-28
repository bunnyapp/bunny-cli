import { Command } from "commander";
import Conf from "conf";
import chalk from "chalk";

const config = new Conf({ projectName: "bunny-cli" });

const listProfiles = new Command("profiles")
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

export default listProfiles;

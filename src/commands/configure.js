import { Command } from "commander";
import { input } from "@inquirer/prompts";
import Conf from "conf";
import chalk from "chalk";

const config = new Conf({ projectName: "bunny-cli" });

const configure = new Command("configure")
  .description("Configure a profile with client ID and client secret")
  .action(async () => {
    const profileName = await input({
      message: "Enter profile name (default: default):",
      default: "default",
    });

    const clientId = await input({
      message: "Enter client ID:",
    });

    const clientSecret = await input({
      message: "Enter client secret:",
    });

    const baseUrl = await input({
      message: "Enter Bunny instance URL e.g. https://subdomain.bunny.com:",
    });

    config.set(`profiles.${profileName}`, { clientId, clientSecret, baseUrl });

    console.log(
      chalk.green(`Profile '${profileName}' configured successfully.`)
    );
  });

export default configure;

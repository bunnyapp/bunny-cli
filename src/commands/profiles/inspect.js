import { Command } from "commander";
import chalk from "chalk";
import Conf from "conf";

const config = new Conf({ projectName: "bunny-cli" });

const inspectProfile = new Command("inspect")
  .description("Inspect a profile's configuration")
  .option("-p, --profile <name>", "Profile name", "default")
  .action(async (options) => {
    const profile = config.get(`profiles.${options.profile}`);

    if (!profile) {
      console.error(
        chalk.red(
          `Profile '${options.profile}' not found. Run "bunny configure" to set up a profile.`
        )
      );
      process.exit(1);
    }

    console.log(chalk.blue("\nProfile Configuration:"));
    console.log(chalk.gray("Name:"), options.profile);
    console.log(chalk.gray("Base URL:"), profile.baseUrl || "Not set");
    console.log(chalk.gray("Client ID:"), profile.clientId || "Not set");
    console.log(
      chalk.gray("Client Secret:"),
      profile.clientSecret ? "********" : "Not set"
    );

    // Show additional stored keys if they exist
    const additionalKeys = Object.keys(profile).filter(
      (key) => !["baseUrl", "clientId", "clientSecret"].includes(key)
    );

    if (additionalKeys.length > 0) {
      console.log(chalk.blue("\nAdditional Configuration:"));
      additionalKeys.forEach((key) => {
        const value = profile[key];
        console.log(
          chalk.gray(key + ":"),
          typeof value === "string" && value.startsWith("sk_")
            ? `${value.slice(0, 8)}...${value.slice(-3)}`
            : value
        );
      });
    }
  });

export default inspectProfile;

import { Command } from "commander";
import Conf from "conf";
import chalk from "chalk";
import ora from "ora";
import client from "../lib/client.js";

const config = new Conf({ projectName: "bunny-cli" });

const query = `query products ($first: Int) {
  products (first: $first) {
    edges {
      node {
        id
        name
      }
    }
    totalCount
  }
}`;

const doctor = new Command("doctor")
  .description(
    "Check API credentials by running a test query against the Bunny instance",
  )
  .option("-p, --profile <name>", "Profile name", "default")
  .action(async (options) => {
    const profile = config.get(`profiles.${options.profile}`);
    if (!profile) {
      console.error(
        chalk.red(
          `Profile '${options.profile}' not found. Run "bunny configure" first.`,
        ),
      );
      process.exit(1);
    }

    const { baseUrl, clientId, clientSecret } = profile;

    console.log(chalk.bold(`\nDiagnosing profile: ${options.profile}`));
    console.log(chalk.gray(`  Base URL:  ${baseUrl}`));
    console.log(chalk.gray(`  Client ID: ${clientId}`));
    console.log("");

    const spinner = ora("Connecting to Bunny API...").start();

    try {
      const bunnyClient = client(baseUrl, clientId, clientSecret);
      const response = await bunnyClient.query(query, { first: 1 });

      if (!response?.data?.products) {
        spinner.fail(chalk.red("Unexpected response structure from API."));
        console.error(chalk.gray(JSON.stringify(response, null, 2)));
        process.exit(1);
      }

      const { totalCount } = response.data.products;
      spinner.succeed(chalk.green("API credentials are valid."));
    } catch (error) {
      spinner.fail(
        chalk.red(
          "API check failed — credentials may be invalid or the instance unreachable.",
        ),
      );

      // The BunnyClient interceptor rejects with error.response?.data, which
      // is a plain string (error_description), a plain object, or undefined
      // (network error / empty body).
      if (error == null) {
        console.error(
          chalk.yellow(
            "\n  No response received. Possible causes:\n" +
              "  • The baseUrl is incorrect or unreachable\n" +
              "  • A network or TLS error occurred (try --unsafe if self-signed cert)\n" +
              "  • The OAuth token endpoint returned an empty body",
          ),
        );
      } else if (typeof error === "string") {
        console.error(chalk.yellow(`\n  OAuth error: ${error}`));
      } else {
        console.error(chalk.yellow("\n  Error detail:"));
        console.error(chalk.gray(JSON.stringify(error, null, 2)));
      }

      console.error(
        chalk.gray(
          '\n  Run "bunny configure" to update credentials for this profile.',
        ),
      );
      process.exit(1);
    }
  });

export default doctor;

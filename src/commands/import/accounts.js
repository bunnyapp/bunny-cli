import { Command } from "commander";
import fs from "fs";
import csv from "csv-parser";
import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import Conf from "conf";
import ProgressBar from "ora-progress-bar";
import client from "../../lib/client.js";
import accountImport from "../../lib/mutations/account-import.js";

const config = new Conf({ projectName: "bunny-cli" });

// Valid account attribute names from the mutation structure
const validAccountAttributes = [
  "code",
  "accountTypeId",
  "industryId",
  "employees",
  "annualRevenue",
  "name",
  "billingStreet",
  "billingCity",
  "billingState",
  "billingZip",
  "billingCountry",
  "billingContactId",
  "shippingStreet",
  "shippingCity",
  "shippingState",
  "shippingZip",
  "shippingCountry",
  "description",
  "phone",
  "fax",
  "website",
  "currencyId",
  "taxNumber",
  "groupId",
  "netPaymentDays",
  "draftInvoices",
  "newQuoteBuilder",
  "duns",
  "timezone",
  "ownerUserId",
  "ipAddress",
  "entityUseCode",
  "linkedinUrl",
  "invoiceTemplateId",
  "entityId",
  "emailsEnabled",
  "disableDunning",
  "consolidatedBilling",
];

// Helper function to convert string values to appropriate types
function convertValue(key, value) {
  if (!value || value === "") {
    return undefined;
  }

  // Boolean fields
  if (
    key === "draftInvoices" ||
    key === "newQuoteBuilder" ||
    key === "emailsEnabled" ||
    key === "disableDunning" ||
    key === "consolidatedBilling"
  ) {
    return value.toLowerCase() === "true" || value === "1";
  }

  // Numeric fields
  if (
    key === "employees" ||
    key === "annualRevenue" ||
    key === "netPaymentDays"
  ) {
    const num = parseInt(value, 10);
    return isNaN(num) ? undefined : num;
  }

  // All other fields are strings
  return value;
}

// Function to count rows
const countRows = async (filePath) => {
  return new Promise((resolve, reject) => {
    let rowCount = 0;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", () => {
        rowCount++;
      })
      .on("end", () => {
        resolve(rowCount);
      })
      .on("error", reject);
  });
};

// Function to parse CSV and convert to account attributes
async function parseAccountsFromCSV(filePath) {
  return new Promise((resolve, reject) => {
    const accounts = [];

    // Create a case-insensitive map of valid attributes
    const validAttributesMap = {};
    validAccountAttributes.forEach((attr) => {
      validAttributesMap[attr.toLowerCase()] = attr;
    });

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        const attributes = {};

        // Map CSV columns to attributes, only including valid attributes
        for (const [key, value] of Object.entries(row)) {
          // Normalize the key (trim, lowercase for comparison)
          const normalizedKey = key.trim().toLowerCase();
          const validAttributeName = validAttributesMap[normalizedKey];

          if (validAttributeName) {
            const convertedValue = convertValue(validAttributeName, value);
            if (convertedValue !== undefined) {
              attributes[validAttributeName] = convertedValue;
            }
          }
        }

        if (Object.keys(attributes).length > 0) {
          accounts.push({ attributes });
        }
      })
      .on("end", () => {
        resolve(accounts);
      })
      .on("error", reject);
  });
}

const importAccounts = new Command("accounts")
  .description("Import accounts in bulk from a csv file")
  .option("-f, --file <path>", "Import file path")
  .option("-p, --profile <name>", "Profile name", "default")
  .option("-v, --verbose", "Show verbose output")
  .action(async (options) => {
    let accounts;
    if (options.file) {
      try {
        if (options.verbose) {
          console.log(chalk.blue("\nReading CSV file..."));
          console.log(chalk.gray("Profile:", options.profile));
          console.log(chalk.gray("File path:", options.file));
        }

        accounts = await parseAccountsFromCSV(options.file);

        if (options.verbose) {
          console.log(
            chalk.gray("Accounts to import:", accounts.length)
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

    // Count rows for confirmation message
    const rowCount = await countRows(options.file);

    const confirmed = await confirm({
      message: `Are you sure you want to import ${rowCount} account(s)?`,
    });

    if (!confirmed) {
      console.log(chalk.red("Ok, import canceled"));
      return;
    }

    // Create progress bar
    const progressBar = new ProgressBar("Importing accounts", accounts.length);

    try {
      if (options.verbose) {
        console.log(chalk.blue("\nSending to API:"));
        console.log(chalk.gray(JSON.stringify({ accounts }, null, 2)));
      }

      const importResults = await accountImport(
        destinationClient,
        { accounts },
        options,
        (current, total) => {
          progressBar.progress();
        }
      );

      // Progress bar automatically finishes at 100%

      if (importResults?.status === "success") {
        console.log(chalk.green(`\n✓ Successfully imported ${importResults.successCount} account(s)`));
      } else if (importResults?.status === "partial") {
        console.log(chalk.yellow(`\n⚠ Imported ${importResults.successCount} of ${importResults.totalCount} account(s). ${importResults.errorCount} failed.`));

        // Show first few errors with account names
        if (importResults.results) {
          const errors = importResults.results.filter(r => !r.success).slice(0, 10);
          console.log(chalk.yellow("\nFirst few errors:"));
          errors.forEach((result, index) => {
            const accountInfo = result.accountName ? ` (${result.accountName})` : "";
            console.log(chalk.red(`  ${index + 1}. ${result.error}${accountInfo}`));
          });
          if (importResults.errorCount > 10) {
            console.log(chalk.yellow(`  ... and ${importResults.errorCount - 10} more errors`));
          }
        }
      } else {
        console.log(chalk.red(`\n✗ Failed to import accounts. ${importResults.errorCount} error(s).`));

        // Show first few errors with account names
        if (importResults.results && importResults.results.length > 0) {
          const errors = importResults.results.filter(r => !r.success).slice(0, 20);
          console.log(chalk.red("\nErrors:"));
          errors.forEach((result, index) => {
            const accountInfo = result.accountName ? ` (${result.accountName})` : "";
            console.log(chalk.red(`  ${index + 1}. ${result.error}${accountInfo}`));
          });
          if (importResults.errorCount > 20) {
            console.log(chalk.red(`  ... and ${importResults.errorCount - 20} more errors`));
          }
        }
        process.exit(1);
      }
    } catch (error) {
      const errorMessage = error?.message || "Unknown error occurred";
      console.error(chalk.red("\nImport error:"));
      console.error(chalk.red(errorMessage));

      // Always show debug information on error
      console.log(chalk.yellow("\nDebug information:"));
      console.log(chalk.gray("Profile:", options.profile));
      console.log(chalk.gray("File:", options.file));
      console.log(chalk.gray("Number of accounts:", accounts.length));
      console.log(chalk.gray("\nFirst account sample:"));
      console.log(chalk.gray(JSON.stringify(accounts[0], null, 2)));
      if (error.stack) {
        console.log(chalk.gray("\nStack trace:"));
        console.log(chalk.gray(error.stack));
      }

      process.exit(1);
    }
  });

export default importAccounts;

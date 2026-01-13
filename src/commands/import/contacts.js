import { Command } from "commander";
import fs from "fs";
import csv from "csv-parser";
import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import Conf from "conf";
import ProgressBar from "ora-progress-bar";
import client from "../../lib/client.js";
import contactImport from "../../lib/mutations/contact-import.js";

const config = new Conf({ projectName: "bunny-cli" });

// Valid contact attribute names from the mutation structure
const validContactAttributes = [
  "code",
  "firstName",
  "lastName",
  "email",
  "salutation",
  "title",
  "phone",
  "mobile",
  "mailingStreet",
  "mailingCity",
  "mailingZip",
  "mailingState",
  "mailingCountry",
  "portalAccess",
  "description",
  "accountId",
  "accountCode",
  "campaignCode",
  "linkedinUrl",
];

// Helper function to convert string values to appropriate types
function convertValue(key, value) {
  if (!value || value === "") {
    return undefined;
  }

  // Boolean fields
  if (key === "portalAccess") {
    return value.toLowerCase() === "true" || value === "1";
  }

  // All other fields are strings
  return value;
}

// Function to parse CSV and convert to contact attributes
async function parseContactsFromCSV(filePath) {
  return new Promise((resolve, reject) => {
    const contacts = [];

    // Create a set of valid attributes for exact matching
    const validAttributesSet = new Set(validContactAttributes);

    let rowNumber = 0;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        rowNumber++;
        const attributes = {};

        // Map CSV columns to attributes, only including valid attributes
        // Use exact column name matching (case-sensitive)
        for (const [key, value] of Object.entries(row)) {
          const trimmedKey = key.trim();

          // Check if the exact column name matches a valid attribute
          if (validAttributesSet.has(trimmedKey)) {
            const convertedValue = convertValue(trimmedKey, value);

            if (convertedValue !== undefined) {
              attributes[trimmedKey] = convertedValue;
            }
          }
        }

        // Add all contacts regardless of validation (validation happens later)
        if (Object.keys(attributes).length > 0) {
          contacts.push({ attributes, rowNumber });
        }
      })
      .on("end", () => {
        resolve(contacts);
      })
      .on("error", reject);
  });
}

const importContacts = new Command("contacts")
  .description("Import contacts in bulk from a csv file")
  .option("-f, --file <path>", "Import file path")
  .option("-p, --profile <name>", "Profile name", "default")
  .option("-v, --verbose", "Show verbose output")
  .action(async (options) => {
    let contacts;
    if (options.file) {
      try {
        if (options.verbose) {
          console.log(chalk.blue("\nReading CSV file..."));
          console.log(chalk.gray("Profile:", options.profile));
          console.log(chalk.gray("File path:", options.file));
        }

        contacts = await parseContactsFromCSV(options.file);

        if (options.verbose) {
          console.log(chalk.gray("Contacts to import:", contacts.length));
          if (contacts.length > 0) {
            console.log(chalk.gray("\nSample contact attributes:"));
            console.log(
              chalk.gray(JSON.stringify(contacts[0].attributes, null, 2))
            );
          }
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

    // Prepare contacts for import (accountCode will be handled by API or needs to be converted separately)
    console.log(chalk.blue("\nPreparing contacts for import..."));

    const contactsToImport = [];
    const skippedContacts = []; // Store skipped contacts with reasons

    for (const contact of contacts) {
      const attributes = { ...contact.attributes };
      const contactIdentifier =
        attributes.email ||
        `${attributes.firstName || ""} ${attributes.lastName || ""}`.trim() ||
        `Row ${contact.rowNumber || "unknown"}`;

      // If both accountId and accountCode are present, accountId takes precedence
      if (attributes.accountId && attributes.accountCode) {
        delete attributes.accountCode;
      }

      // Validate that contact has either accountId or accountCode
      if (!attributes.accountId && !attributes.accountCode) {
        skippedContacts.push({
          rowNumber: contact.rowNumber,
          identifier: contactIdentifier,
          reason:
            "Missing required field - must have either accountId or accountCode",
        });
        continue;
      }

      // Validate that firstName is not blank
      if (!attributes.firstName || attributes.firstName.trim() === "") {
        skippedContacts.push({
          rowNumber: contact.rowNumber,
          identifier: contactIdentifier,
          reason: "Missing required field - firstName cannot be blank",
        });
        continue;
      }

      contactsToImport.push({ attributes });
    }

    // Show summary
    console.log(chalk.blue("\nPreparation complete.\n"));
    console.log(
      chalk.green(`✓ ${contactsToImport.length} contact(s) will be imported`)
    );

    if (skippedContacts.length > 0) {
      console.log(
        chalk.yellow(
          `⚠ ${skippedContacts.length} contact(s) will not be imported due to validation errors`
        )
      );

      if (options.verbose) {
        console.log(chalk.yellow("\nSkipped contacts:"));
        skippedContacts.slice(0, 20).forEach((skipped) => {
          console.log(
            chalk.gray(
              `  Row ${skipped.rowNumber} (${skipped.identifier}): ${skipped.reason}`
            )
          );
        });
        if (skippedContacts.length > 20) {
          console.log(
            chalk.gray(`  ... and ${skippedContacts.length - 20} more`)
          );
        }
      }
    }

    if (contactsToImport.length === 0) {
      console.error(chalk.red("\nNo valid contacts to import. Exiting."));
      process.exit(1);
    }

    // Prompt for confirmation with summary
    const confirmed = await confirm({
      message: `Proceed with importing ${contactsToImport.length} contact(s)?`,
    });

    if (!confirmed) {
      console.log(chalk.red("Ok, import canceled"));
      return;
    }

    // Create progress bar
    const progressBar = new ProgressBar(
      "Importing contacts",
      contactsToImport.length
    );

    try {
      if (options.verbose) {
        console.log(chalk.blue("\nSending to API:"));
        console.log(
          chalk.gray(JSON.stringify({ contacts: contactsToImport }, null, 2))
        );
      }

      const importResults = await contactImport(
        destinationClient,
        { contacts: contactsToImport },
        options,
        (current, total) => {
          progressBar.progress();
        }
      );

      // Progress bar automatically finishes at 100%

      if (importResults?.status === "success") {
        console.log(
          chalk.green(
            `\n✓ Successfully imported ${importResults.successCount} contact(s)`
          )
        );
      } else if (importResults?.status === "partial") {
        console.log(
          chalk.yellow(
            `\n⚠ Imported ${importResults.successCount} of ${importResults.totalCount} contact(s). ${importResults.errorCount} failed.`
          )
        );

        // Show first few errors with contact names
        if (importResults.results) {
          const errors = importResults.results
            .filter((r) => !r.success)
            .slice(0, 10);
          console.log(chalk.yellow("\nFirst few errors:"));
          errors.forEach((result, index) => {
            const contactInfo = result.contactName
              ? ` (${result.contactName})`
              : "";
            console.log(
              chalk.red(`  ${index + 1}. ${result.error}${contactInfo}`)
            );
          });
          if (importResults.errorCount > 10) {
            console.log(
              chalk.yellow(
                `  ... and ${importResults.errorCount - 10} more errors`
              )
            );
          }
        }
      } else {
        console.log(
          chalk.red(
            `\n✗ Failed to import contacts. ${importResults.errorCount} error(s).`
          )
        );

        // Show first few errors with contact names
        if (importResults.results && importResults.results.length > 0) {
          const errors = importResults.results
            .filter((r) => !r.success)
            .slice(0, 20);
          console.log(chalk.red("\nErrors:"));
          errors.forEach((result, index) => {
            const contactInfo = result.contactName
              ? ` (${result.contactName})`
              : "";
            console.log(
              chalk.red(`  ${index + 1}. ${result.error}${contactInfo}`)
            );
          });
          if (importResults.errorCount > 20) {
            console.log(
              chalk.red(
                `  ... and ${importResults.errorCount - 20} more errors`
              )
            );
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
      const contactsForDebug = contactsToImport || contacts;
      console.log(chalk.gray("Number of contacts:", contactsForDebug.length));
      if (contactsForDebug.length > 0) {
        console.log(chalk.gray("\nFirst contact sample:"));
        console.log(chalk.gray(JSON.stringify(contactsForDebug[0], null, 2)));
      }
      if (error.stack) {
        console.log(chalk.gray("\nStack trace:"));
        console.log(chalk.gray(error.stack));
      }

      process.exit(1);
    }
  });

export default importContacts;

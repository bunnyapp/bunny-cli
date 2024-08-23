import { Command } from "commander";
import fs from "fs";
import csv from "csv-parser";
import readline from "readline";
import { confirm } from "@inquirer/prompts";
import ora from "ora";
import ProgressBar from "ora-progress-bar";
import chalk from "chalk";
import { parseISO, format } from "date-fns";
import client from "../../lib/client.js";
import subscriptionCreate from "../../lib/mutations/subscription-create.js";
import { ro } from "date-fns/locale";

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

async function getTierStartValue(row, chargeIndex, tierIndex) {
  const columnName = `Charge ${chargeIndex} Tier ${tierIndex} Quantity From`;

  if (row.hasOwnProperty(columnName)) {
    let value = row[columnName];

    if (value !== undefined && value !== null && !isNaN(value)) {
      value = parseInt(value, 10);

      if (Number.isInteger(value)) {
        if (value === 0) {
          value = 1;
        }

        return value;
      }
    }
  }

  return null;
}

async function processRow(row, accountMap, client) {
  let startDate = parseISO(row["Start Date"]);
  let endDate = parseISO(row["End Date"]);
  let invalidSubscriptionAttributes = false;
  let chargeIndex = 0;

  let variables = {
    attributes: {
      priceListCode: row["Price List Code"],
      trial: false,
      evergreen: true,
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
      tenant: {
        code: row["Tenant Code"],
        name: row["Account Name"],
      },
      priceListCharges: [],
    },
  };

  if (endDate < startDate) {
    invalidSubscriptionAttributes = true;
    console.log(chalk.red("End date is before start date"));
  }

  if (row["Trial Start Date"]) {
    variables.attributes.trial = true;
    variables.attributes.trialStartDate = format(
      parseISO(row["Trial Start Date"]),
      "yyyy-MM-dd"
    );
  }

  // Check if account exists already
  if (accountMap[row["Account ID"]]) {
    variables.attributes["accountId"] = accountMap[row["Account ID"]];
  } else {
    variables.attributes["account"] = {
      code: row["Account Code"],
      name: row["Account Name"],
      taxNumber: row["Tax Number"],
      billingStreet: row["Address Line 1"],
      billingCity: row["City"],
      billingState: row["State"],
      billingZip: row["Postal Code"],
      billingCountry: row["Country"],
      billingContact: {
        firstName: row["Billing Contact First Name"],
        lastName: row["Billing Contact Last Name"],
        email: row["Billing Contact Email"].trim(),
      },
    };
  }

  do {
    if (!row[`Charge ${chargeIndex} Code`]) break;

    let amount = parseFloat(
      row[`Charge ${chargeIndex} Amount`].replace(",", "")
    );

    if (amount < 0) {
      invalidSubscriptionAttributes = true;
      console.log(chalk.red("Negative charge detected"));
    }

    let charge = {
      code: row[`Charge ${chargeIndex} Code`],
    };

    if (row[`Charge ${chargeIndex} Type`].toLowerCase() != "usage") {
      let quantity = parseInt(
        row[`Charge ${chargeIndex} Quantity`].replace(",", "")
      );

      charge.quantity = quantity > 0 ? quantity : 1;
    }

    let priceModel = row[`Charge ${chargeIndex} Price Model`]?.toLowerCase();
    if (priceModel === "tiered" || priceModel === "volume") {
      let tierIndex = 0;
      do {
        let start = await getTierStartValue(row, chargeIndex, tierIndex);
        if (!start) break;

        let price = parseFloat(
          row[`Charge ${chargeIndex} Tier ${tierIndex} Price`].replace(",", "")
        );

        charge.priceTiers = charge.priceTiers || [];

        if (price >= 0) {
          charge.priceTiers.push({
            starts: start,
            price: price,
          });
        } else {
          console.log(
            chalk.red(
              "Negative price tier charge detected. Not setting custom price tier"
            )
          );
        }

        tierIndex++;
      } while (true);
    } else {
      charge.price = amount;
    }

    if (
      !charge.code.startsWith("NOT_FOUND") &&
      charge.code != "DISCOUNT_REQUIRED"
    ) {
      variables.attributes.priceListCharges.push(charge);
    }

    chargeIndex++;
  } while (true);

  if (invalidSubscriptionAttributes) {
    // Bailing out on this subscription
    console.log(
      chalk.red(
        `Invalid subscription attributes. Not importing subscription for ${row["Account Name"]} with price list ${row["Price List Code"]}`
      )
    );
    return null;
  }

  return await subscriptionCreate(client, variables);
}

async function processRows(client, filePath, rowCount) {
  const parser = fs.createReadStream(filePath).pipe(csv());

  const progressBar = new ProgressBar("Importing subscriptions", rowCount);

  let accountMap = {};
  let notImported = [];

  for await (const row of parser) {
    let subscription = await processRow(row, accountMap, client);

    if (subscription) {
      accountMap[row["Account ID"]] = subscription.account.id;
    } else {
      notImported.push(row["Account Name"]);
    }

    progressBar.progress();
  }

  console.log(`Imported ${accountMap.length} accounts`);
  console.log(`Imported ${rowCount - notImported.length} subscriptions`);

  if (notImported.length > 0) {
    console.log(
      chalk.red(
        `${
          notImported.length
        } subscriptions were not imported: ${notImported.join(", ")}`
      )
    );
  }
}

const importProducts = new Command("subscriptions")
  .description("Import subscriptions in bulk from a json file")
  .option("-f, --file <path>", "Import file path")
  .action(async (options) => {
    // const destinationSubdomain = await input({
    //   message: "Enter a subdomain for the destination Bunny instance",
    // });
    // const destinationAccessToken = await input({
    //   message: "Enter an access token for the destination Bunny instance",
    // });

    const destinationClient = client(
      "https://bunny.bunny.internal",
      "eyJraWQiOiJ6Yzhvc1N1VDJCRGxjbXBISWxlamxJZHBoa24xMW50RlN6MEtGTGc1R3JnIiwiYWxnIjoiSFM1MTIifQ.eyJpc3MiOiJJbXBvcnQgQ2xpZW50IiwiaWF0IjoxNzIzODMzMzAzLCJqdGkiOiIwYzA0MjY2ZC04YTQ5LTQ3ODQtOGRlYS0yNGQ2NmJhMmMyMDMiLCJjbGllbnRfaWQiOiJ6Yzhvc1N1VDJCRGxjbXBISWxlamxJZHBoa24xMW50RlN6MEtGTGc1R3JnIiwiYXVkIjoiaHR0cHM6Ly9idW5ueS5pbnRlcm5hbCIsImV4cCI6MTczMTAzMzMwMywic2NvcGUiOiJzZWN1cml0eTpyZWFkIHNlY3VyaXR5OndyaXRlIGFkbWluOnJlYWQgYWRtaW46d3JpdGUgb3duZXI6cmVhZCBvd25lcjp3cml0ZSBzdGFuZGFyZDpyZWFkIHN0YW5kYXJkOndyaXRlIHF1b3Rpbmc6cmVhZCBxdW90aW5nOndyaXRlIHByb2R1Y3Q6cmVhZCBwcm9kdWN0OndyaXRlIHdvcmtmbG93OnJlYWQgd29ya2Zsb3c6d3JpdGUgZGV2ZWxvcGVyOnJlYWQgZGV2ZWxvcGVyOndyaXRlIG9wZW5pZCBiaWxsaW5nOnJlYWQgYmlsbGluZzp3cml0ZSBhbmFseXRpY3M6cmVhZCBhbmFseXRpY3M6d3JpdGUgbGVnZW5kYXJ5OnJlYWQgbGVnZW5kYXJ5OndyaXRlIHBsYXRmb3JtOnJlYWQgcGxhdGZvcm06d3JpdGUgcG9ydGFsOndyaXRlIHBvcnRhbDpyZWFkIiwic3ViIjoiYzYxMGQ5MWEtZDBkNS00NDEyLWJlMTYtZDM1ZDI2NWY5NGFkIiwic3ViX3R5cGUiOiJVc2VyIiwiYWN0b3JfZGlzcGxheV9hcyI6eyJpZCI6MSwidHlwZSI6IkFwaUNsaWVudCJ9fQ.BMAAbvKd5knBzPIBOYfRpMIPK07vFH9QEGZe2v9SSNJvJul0XRfhqat88Mv5PaVLs8gP760ntlc2rYe-ymonCQ"
    );

    const confirmed = await confirm({
      message: "Are you sure you want to do this?",
    });

    if (!confirmed) {
      console.log(chalk.red("Ok, import canceled"));
      return;
    }

    const rowCount = await countRows(options.file);

    await processRows(destinationClient, options.file, rowCount);
  });

export default importProducts;

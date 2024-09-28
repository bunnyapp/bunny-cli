import { Command } from "commander";
import fs from "fs";
import csv from "csv-parser";
import readline from "readline";
import { confirm } from "@inquirer/prompts";
import ora from "ora";
import Conf from "conf";
import ProgressBar from "ora-progress-bar";
import chalk from "chalk";
import { parseISO, format } from "date-fns";
import client from "../../lib/client.js";
import subscriptionCreate from "../../lib/mutations/subscription-create.js";
import { ro } from "date-fns/locale";
import { createObjectCsvWriter as createCsvWriter } from "csv-writer";

const config = new Conf({ projectName: "bunny-cli" });

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

  let variables = {
    attributes: {
      priceListCode: row["Price List Code"],
      trial: false,
      evergreen: row["Evergreen"].toLowerCase() === "true",
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
      tenant: {
        code: row["Tenant Code"],
        name: row["Tenant Name"],
      },
      priceListCharges: [],
      discounts: [],
    },
  };

  if (endDate < startDate) {
    invalidSubscriptionAttributes = true;
    console.log(chalk.red("End date is before start date"));
  }

  if (row["Trial Start Date"]) {
    // Only create a trial if the start date is in the future
    if (startDate > new Date()) {
      variables.attributes.trial = true;
      variables.attributes.trialStartDate = format(
        parseISO(row["Trial Start Date"]),
        "yyyy-MM-dd"
      );
    }
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
      emailsEnabled: row["Emails Enabled"].toLowerCase() === "true",
      netPaymentDays: parseInt(row["Net Payment Days"]),
    };
  }

  // Add discounts
  let discountIndex = 1;
  do {
    if (!row[`Discount ${discountIndex} Code`]) break;

    let amount = parseFloat(
      row[`Discount ${discountIndex} Amount`].replace(",", "")
    );

    let discount = {
      code: row[`Discount ${discountIndex} Code`],
      name: row[`Discount ${discountIndex} Name`],
      price: Math.abs(amount),
    };

    if (row[`Discount ${discountIndex} Quantity`]) {
      discount.quantity = parseInt(
        row[`Discount ${discountIndex} Quantity`].replace(",", "")
      );
    }

    if (row[`Discount ${discountIndex} Start Date`]) {
      let discountStartDate = parseISO(
        row[`Discount ${discountIndex} Start Date`]
      );
      discount.startDate = format(discountStartDate, "yyyy-MM-dd");
    }

    if (row[`Discount ${discountIndex} End Date`]) {
      let discountEndDate = parseISO(row[`Discount ${discountIndex} End Date`]);
      discount.endDate = format(discountEndDate, "yyyy-MM-dd");
    }

    variables.attributes.discounts.push(discount);

    discountIndex++;
  } while (true);

  // Find all columns that start with Charge and end with Code
  const chargeCodeColumns = Object.keys(row).filter(
    (key) => key.startsWith("Charge ") && key.endsWith(" Code")
  );

  // Create an array of charge codes and remove all the empty strings
  const chargeCodes = chargeCodeColumns
    .map((key) => row[key])
    .filter((code) => code !== "");

  // Add custom charges
  let chargeIndex = 1;
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

    // Check how many times the code is in the chargeCodes array
    const chargeCodeCount = chargeCodes.filter(
      (code) => code === charge.code
    ).length;

    if (chargeCodeCount > 1) {
      // If the same charge code is used multiple times then we need to
      // include the charge start and end dates
      charge.startDate = format(
        parseISO(row[`Charge ${chargeIndex} Effective Start Date`]),
        "yyyy-MM-dd"
      );
      charge.endDate = format(
        parseISO(row[`Charge ${chargeIndex} Effective End Date`]),
        "yyyy-MM-dd"
      );
    }

    if (row[`Charge ${chargeIndex} Type`].toLowerCase() != "usage") {
      let quantity = parseInt(
        row[`Charge ${chargeIndex} Quantity`].replace(",", "")
      );

      charge.quantity = quantity > 0 ? quantity : 1;
    }

    // Add price custom price tiers
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
              `Negative price tier charge detected. Setting price to 0. ${row["Account Name"]} ${charge.code} ${price}`
            )
          );
          charge.priceTiers.push({
            starts: start,
            price: 0,
          });
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
      // Dont include duplicate charges
      // let existingCharge = variables.attributes.priceListCharges.find(
      //   (c) => c.code === charge.code
      // );

      // if (!existingCharge) {
      variables.attributes.priceListCharges.push(charge);
      // }
    }

    chargeIndex++;
  } while (true);

  if (invalidSubscriptionAttributes) {
    // Bailing out on this subscription
    // console.log(
    //   chalk.red(
    //     `Invalid subscription attributes. Not importing subscription for ${row["Account Name"]} with price list ${row["Price List Code"]}`
    //   )
    // );
    return null;
  }

  // if (variables.attributes.account.name.startsWith("Phone")) {
  // console.log(JSON.stringify(variables, null, 2));
  //   process.exit();
  // }

  return await subscriptionCreate(client, variables);
}

async function processRows(client, filePath, rowCount) {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  const outputFilePath = `subscriptions_output_${timestamp}.csv`;
  const parser = fs.createReadStream(filePath).pipe(csv());
  const progressBar = new ProgressBar("Importing subscriptions", rowCount);

  let accountMap = {};
  let headers = null;
  let failedCount = 0;
  let csvWriter = null;

  for await (const row of parser) {
    // Capture headers from the first row
    if (!headers) {
      headers = Object.keys(row);

      // Add headers for status and error
      headers.push(
        "Bunny Account ID",
        "Bunny Subscription ID",
        "Import Status"
      );

      // Initialize the CSV writer with headers
      csvWriter = createCsvWriter({
        path: outputFilePath,
        header: headers.map((header) => ({ id: header, title: header })),
      });

      // Write the header row to the output CSV
      // await csvWriter.writeRecords([]);
    }

    let subscription = await processRow(row, accountMap, client);

    if (subscription) {
      accountMap[row["Account ID"]] = subscription.account.id;
      row["Bunny Account ID"] = subscription.account.id;
      row["Bunny Subscription ID"] = subscription.id;
      row["Import Status"] = "Success";
    } else {
      failedCount++;
      row["Bunny Account ID"] = "";
      row["Bunny Subscription ID"] = "";
      row["Import Status"] = "Failed";
    }

    await csvWriter.writeRecords([row]);

    progressBar.progress();
  }

  console.log(`Imported ${rowCount - failedCount} subscriptions`);

  if (failedCount > 0) {
    console.log(
      chalk.red(
        `${failedCount} subscriptions were not imported. See ${outputFilePath} for details.`
      )
    );
  }
}

const importSubscriptions = new Command("subscriptions")
  .description("Import subscriptions in bulk from a json file")
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

    const rowCount = await countRows(options.file);

    await processRows(destinationClient, options.file, rowCount);
  });

export default importSubscriptions;

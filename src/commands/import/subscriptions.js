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
  let variables = {
    attributes: {
      priceListCode: row["Price List Code"],
      trial: false,
      evergreen: true,
      startDate: format(parseISO(row["Start Date"]), "yyyy-MM-dd"),
      endDate: format(parseISO(row["End Date"]), "yyyy-MM-dd"),
      tenant: {
        code: row["Tenant Code"],
        name: row["Account Name"],
      },
      priceListCharges: [],
    },
  };

  // Check if account exists already
  if (accountMap[row["Account ID"]]) {
    variables.attributes["accountId"] = accountMap[row["Account ID"]];
  } else {
    variables.attributes["account"] = {
      code: row["Account ID"],
      name: row["Account Name"],
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

  let containsNegativeCharge = false;
  let chargeIndex = 0;

  do {
    if (!row[`Charge ${chargeIndex} Code`]) break;

    let amount = parseFloat(
      row[`Charge ${chargeIndex} Amount`].replace(",", "")
    );

    if (amount < 0) {
      containsNegativeCharge = true;
    }

    let charge = {
      code: row[`Charge ${chargeIndex} Code`],
    };

    let priceModel = row[`Charge ${chargeIndex} Price Model`]?.toLowerCase();
    if (priceModel === "tiered" || priceModel === "volume") {
      let tierIndex = 0;
      do {
        let start = await getTierStartValue(row, chargeIndex, tierIndex);
        if (!start) break;

        let price = parseFloat(
          row[`Charge ${chargeIndex} Tier ${tierIndex} Price`].replace(",", "")
        );

        charge.quoteChargePriceTiers = charge.quoteChargePriceTiers || [];

        charge.quoteChargePriceTiers.push({
          starts: start,
          price: price,
        });

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

  if (containsNegativeCharge) {
    console.log(
      chalk.red(
        `Negative charge detected. Not importing subscription for ${row["Account Name"]} with price list ${row["Price List Code"]}`
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

    const destinationClient = client("https://bunny.bunny.internal", "xxx");

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

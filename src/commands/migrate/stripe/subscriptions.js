import { Command } from "commander";
import { promises as fs } from "fs";
import { confirm, input } from "@inquirer/prompts";
import ora from "ora";
import chalk from "chalk";
import Conf from "conf";
import { Stripe } from "stripe";
import path from "path";
import os from "os";
import client from "../../../lib/client.js";
import subscriptionCreate from "../../../lib/mutations/subscription-create.js";

const config = new Conf({ projectName: "bunny-cli" });

async function fetchAllSubscriptions(stripe) {
  const subscriptions = [];
  for await (const subscription of stripe.subscriptions.list({
    limit: 100,
    status: "active",
    expand: ["data.customer", "data.items.data.price"],
  })) {
    // Fetch the product separately to avoid expansion limits
    const items = await Promise.all(
      subscription.items.data.map(async (item) => {
        const price = item.price;
        const product = await stripe.products.retrieve(price.product);
        return {
          ...item,
          price: {
            ...price,
            product,
          },
        };
      })
    );

    subscriptions.push({
      id: subscription.id,
      customer: subscription.customer.id,
      customer_data: subscription.customer,
      items: items,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at: subscription.cancel_at,
      trial_start: subscription.trial_start,
      trial_end: subscription.trial_end,
      discounts: subscription.discounts,
      schedule: subscription.schedule,
    });
  }
  return subscriptions;
}

async function fetchAllCustomers(stripe) {
  const customers = [];
  for await (const customer of stripe.customers.list({
    limit: 100,
    expand: ["data.tax_ids"],
  })) {
    customers.push({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      tax_ids: customer.tax_ids?.data || [],
    });
  }
  return customers;
}

function transformToImportFormat(stripeData, options = {}) {
  const subscriptions = [];

  // Create a lookup hash for customers
  const customerLookup = stripeData.customers.reduce((acc, customer) => {
    acc[customer.id] = customer;
    return acc;
  }, {});

  let trial = false;

  // Process each subscription
  stripeData.subscriptions.forEach((subscription) => {
    // Skip if subscription has an active trial
    if (
      subscription.trial_start &&
      subscription.trial_end > Math.floor(Date.now() / 1000)
    ) {
      trial = true;
      console.warn(
        chalk.yellow(
          `Warning: Skipping subscription ${subscription.id} because it has an active trial`
        )
      );
      return;
    }

    // Skip if subscription has any percentage discounts
    if (
      subscription.discounts?.some(
        (discount) => discount.coupon && discount.coupon.percent_off
      )
    ) {
      console.warn(
        chalk.yellow(
          `Warning: Skipping subscription ${subscription.id} because it has a percentage discount`
        )
      );
      return;
    }

    // Handle subscription schedules
    if (subscription.schedule) {
      const phases = subscription.schedule.phases;
      if (!phases || phases.length !== 1) {
        console.warn(
          chalk.yellow(
            `Warning: Skipping subscription ${subscription.id} because it has a schedule with multiple phases`
          )
        );
        return;
      }

      const currentPhase = phases[0];
      if (
        subscription.cancel_at &&
        subscription.cancel_at === currentPhase.end_date
      ) {
        // Schedule phase appears to be a cancellation
        subscription.end_date = subscription.cancel_at;
      } else {
        console.warn(
          chalk.yellow(
            `Warning: Skipping subscription ${subscription.id} because it has a schedule with a single phase that isn't a cancellation`
          )
        );
        return;
      }
    }

    // Use the expanded customer data if available, otherwise fall back to lookup
    const customer =
      subscription.customer_data || customerLookup[subscription.customer];
    if (!customer) {
      console.warn(
        chalk.yellow(
          `Warning: Skipping subscription ${subscription.id} because customer not found`
        )
      );
      return;
    }

    // Process each item in the subscription
    subscription.items.forEach((item) => {
      const price = item.price;
      if (!price || typeof price !== "object") return;

      // Format dates properly
      const startDate = item.current_period_start
        ? new Date(item.current_period_start * 1000).toISOString()
        : null;

      let endDate = null;
      if (subscription.end_date) {
        endDate = new Date(subscription.end_date * 1000).toISOString();
      } else if (subscription.cancel_at) {
        endDate = new Date(subscription.cancel_at * 1000).toISOString();
      } else if (item.current_period_end) {
        endDate = new Date(item.current_period_end * 1000).toISOString();
      }

      if (!startDate || !endDate) {
        console.warn(
          chalk.yellow(
            `Warning: Skipping subscription ${subscription.id} because of invalid dates. Start date: ${startDate}, End date: ${endDate}`
          )
        );
        return;
      }

      const subscriptionData = {
        account: {
          code: customer.id,
          name: customer.name,
          billingContact: {
            firstName: customer.name?.split(" ")[0] || "",
            lastName: customer.name?.split(" ").slice(1).join(" ") || "",
            email: customer.email,
          },
          billingStreet: customer.address?.line1,
          billingCity: customer.address?.city,
          billingState: customer.address?.state,
          billingZip: customer.address?.postal_code,
          billingCountry: customer.address?.country,
          shippingStreet: customer.shipping?.line1,
          shippingCity: customer.shipping?.city,
          shippingState: customer.shipping?.state,
          shippingZip: customer.shipping?.postal_code,
          shippingCountry: customer.shipping?.country,
        },
        tenant: {
          code: customer.id,
          name: customer.name,
        },
        priceListCode: price.id,
        priceListCharges: [
          {
            code: `${price.id}_charge`,
            quantity: item.quantity,
            startDate: startDate,
            endDate: endDate,
          },
        ],
        startDate,
        endDate,
        evergreen: !subscription.cancel_at,
        trial: trial,
        trialStartDate: subscription.trial_start
          ? new Date(subscription.trial_start * 1000).toISOString()
          : null,
      };

      // Add tax information if available
      if (customer.tax_ids?.length > 0) {
        subscriptionData.account.taxNumber = customer.tax_ids[0].value;
      }

      // Add contact information if available
      if (customer.email) {
        subscriptionData.account.billingContact.email = customer.email;
      }
      if (customer.phone) {
        subscriptionData.account.billingContact.phone = customer.phone;
      }

      subscriptions.push(subscriptionData);
    });
  });

  return subscriptions;
}

const migrateStripeSubscriptions = new Command("subscriptions")
  .description("Migrate subscriptions from Stripe to Bunny")
  .option("-p, --profile <name>", "Profile name", "default")
  .option("-v, --verbose", "Show verbose output")
  .action(async (options) => {
    // Get or prompt for Stripe key
    const profileKey = `profiles.${options.profile}.stripeSecretKey`;
    let stripeKey = config.get(profileKey);

    if (stripeKey) {
      // Show masked key: sk_live_123...abc
      const maskedKey = `${stripeKey.slice(0, 8)}...${stripeKey.slice(-3)}`;
      const useExisting = await confirm({
        message: `Use existing Stripe key (${maskedKey})?`,
      });

      if (!useExisting) {
        stripeKey = null;
      }
    }

    if (!stripeKey) {
      stripeKey = await input({
        message: "Enter your Stripe secret key:",
        validate: (value) =>
          value.startsWith("sk_") ? true : "Invalid Stripe secret key format",
      });

      const saveKey = await confirm({
        message: "Would you like to save this key for future use?",
      });

      if (saveKey) {
        config.set(profileKey, stripeKey);
      }
    }

    const stripe = new Stripe(stripeKey);

    // Create temp directory for storing the intermediate files
    const tempDir = path.join(os.tmpdir(), "bunny-stripe-migration");
    await fs.mkdir(tempDir, { recursive: true });

    // Fetch data from Stripe
    let spinner = ora("Fetching data from Stripe").start();
    try {
      const stripeData = {
        subscriptions: await fetchAllSubscriptions(stripe),
        customers: await fetchAllCustomers(stripe),
        exported_at: new Date().toISOString(),
      };

      const stripeDataPath = path.join(tempDir, "stripe_subscriptions.json");
      await fs.writeFile(stripeDataPath, JSON.stringify(stripeData, null, 2));
      spinner.succeed("Stripe data fetched and saved");

      // Show counts of what will be migrated
      console.log(chalk.blue("\nFound in Stripe:"));
      console.log(chalk.gray(`- ${stripeData.customers.length} customers`));
      console.log(
        chalk.gray(`- ${stripeData.subscriptions.length} subscriptions`)
      );

      // Transform data to Bunny format
      spinner = ora("Transforming data to Bunny format").start();
      const bunnyData = transformToImportFormat(stripeData, options);
      const bunnyDataPath = path.join(tempDir, "bunny_subscriptions.json");
      await fs.writeFile(bunnyDataPath, JSON.stringify(bunnyData, null, 2));
      spinner.succeed("Data transformed to Bunny format");

      // Only show detailed import info in verbose mode
      if (options.verbose) {
        console.log(chalk.blue("\nAttempting to import the following data:"));
        console.log(chalk.gray("Profile:", options.profile));
        console.log(chalk.gray("File path:", bunnyDataPath));
        console.log(chalk.gray("Subscriptions to import:", bunnyData.length));
      }

      // Get confirmation before import
      const confirmed = await confirm({
        message: `Are you sure you want to import ${bunnyData.length} subscriptions?`,
      });

      if (!confirmed) {
        console.log(chalk.red("Ok, import canceled"));
        return;
      }

      // Create a new spinner for the import
      spinner = ora("Importing subscriptions").start();

      // Execute the import using the subscriptionCreate mutation
      const profileConfig = config.get(`profiles.${options.profile}`);
      if (!profileConfig) {
        throw new Error(
          `Profile '${options.profile}' not found in configuration`
        );
      }

      if (
        !profileConfig.baseUrl ||
        !profileConfig.clientId ||
        !profileConfig.clientSecret
      ) {
        throw new Error(
          `Profile '${options.profile}' is missing required configuration (baseUrl, clientId, or clientSecret)`
        );
      }

      const destinationClient = client(
        profileConfig.baseUrl,
        profileConfig.clientId,
        profileConfig.clientSecret
      );

      let successCount = 0;
      let errorCount = 0;

      for (const subscription of bunnyData) {
        try {
          const result = await subscriptionCreate(destinationClient, {
            attributes: subscription,
          });

          if (result) {
            successCount++;
          } else {
            errorCount++;
            console.warn(
              chalk.yellow(
                `Failed to import subscription for account ${subscription.account.name}`
              )
            );
          }
        } catch (error) {
          errorCount++;
          console.warn(
            chalk.yellow(
              `Error importing subscription for account ${subscription.account.name}:`,
              error.message
            )
          );
        }
      }

      if (errorCount === 0) {
        spinner.succeed("Successfully imported subscriptions");
        console.log(
          JSON.stringify(
            {
              status: "success",
              imported: successCount,
              subscriptions: bunnyData,
            },
            null,
            2
          )
        );
      } else {
        spinner.warn("Import completed with errors");
        console.log(
          JSON.stringify(
            {
              status: "partial",
              imported: successCount,
              errors: errorCount,
              subscriptions: bunnyData,
            },
            null,
            2
          )
        );
      }

      // Keep the temp files if in verbose mode
      if (options.verbose) {
        console.log(chalk.yellow("\nDebug files preserved at:", tempDir));
        console.log(chalk.yellow("Files:"));
        console.log(
          chalk.yellow(
            "- Stripe data:",
            path.join(tempDir, "stripe_subscriptions.json")
          )
        );
        console.log(
          chalk.yellow(
            "- Bunny data:",
            path.join(tempDir, "bunny_subscriptions.json")
          )
        );
      }
    } catch (error) {
      spinner.fail("Error during migration");
      const errorMessage =
        error?.message || "Unknown error occurred during migration";
      console.error(chalk.red("\nError:", errorMessage));

      // Keep the temp files if there was an error or in verbose mode
      if (tempDir && (options.verbose || error)) {
        console.log(chalk.yellow("\nDebug files preserved at:", tempDir));
        console.log(chalk.yellow("Files:"));
        console.log(
          chalk.yellow(
            "- Stripe data:",
            path.join(tempDir, "stripe_subscriptions.json")
          )
        );
        console.log(
          chalk.yellow(
            "- Bunny data:",
            path.join(tempDir, "bunny_subscriptions.json")
          )
        );

        if (options.verbose && error.stack) {
          console.log(chalk.yellow("\nStack trace:"));
          console.log(chalk.gray(error.stack));
        }
      }

      process.exit(1);
    }
  });

export default migrateStripeSubscriptions;

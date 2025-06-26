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
import productImport from "../../../lib/mutations/product-import.js";
import platformsQuery from "../../../lib/queries/platforms.js";

const config = new Conf({ projectName: "bunny-cli" });

async function fetchProductFeatures(stripe, productId) {
  const features = [];
  for await (const productFeature of stripe.products.listFeatures(productId)) {
    if (productFeature.entitlement_feature) {
      const feature = productFeature.entitlement_feature;
      features.push({
        id: feature.id,
        name: feature.name,
        active: feature.active,
        lookup_key: feature.lookup_key,
        metadata: feature.metadata,
        product_feature_id: productFeature.id,
        livemode: productFeature.livemode,
      });
    }
  }
  return features;
}

async function fetchMeterConfiguration(stripe, price) {
  if (!price.recurring?.usage_type === "metered") return null;

  try {
    const meterId = price.metadata?.meter_id;
    if (!meterId) return null;

    const meter = await stripe.meters.retrieve(meterId);
    return {
      id: meter.id,
      display_name: meter.display_name,
      usage_aggregation_mode: meter.usage_aggregation_mode,
      usage_aggregation_interval: meter.usage_aggregation_interval,
      active: meter.active,
      created: meter.created,
      metadata: meter.metadata,
      livemode: meter.livemode,
    };
  } catch (error) {
    return null;
  }
}

async function fetchProductPrices(stripe, productId) {
  const prices = [];
  for await (const price of stripe.prices.list({
    limit: 100,
    active: true,
    product: productId,
    expand: ["data.tiers"],
  })) {
    const priceData = {
      id: price.id,
      active: price.active,
      currency: price.currency,
      unit_amount: price.unit_amount,
      unit_amount_decimal: price.unit_amount_decimal,
      billing_scheme: price.billing_scheme,
      nickname: price.nickname,
      lookup_key: price.lookup_key,
      metadata: price.metadata,
      type: price.type,
      created: price.created,
      recurring: price.recurring,
      transform_quantity: price.transform_quantity,
      tiers_mode: price.tiers_mode,
      is_metered: price.recurring?.usage_type === "metered",
    };

    if (price.recurring?.usage_type === "metered") {
      priceData.metering = {
        usage_type: price.recurring.usage_type,
        meter: price.recurring.meter,
        interval: price.recurring.interval,
        interval_count: price.recurring.interval_count,
      };
    }

    if (price.tiers) {
      priceData.tiers = price.tiers.map((tier) => {
        const tierData = {};
        [
          "up_to",
          "flat_amount",
          "flat_amount_decimal",
          "unit_amount",
          "unit_amount_decimal",
        ].forEach((field) => {
          if (tier[field] !== undefined) tierData[field] = tier[field];
        });
        return tierData;
      });
    }

    if (price.tax_behavior) {
      priceData.tax_behavior = price.tax_behavior;
    }

    if (price.unit_amount) {
      priceData.unit_amount_display = (price.unit_amount / 100).toFixed(2);
    }

    prices.push(priceData);
  }
  return prices;
}

async function fetchAllProducts(stripe) {
  const products = [];
  for await (const product of stripe.products.list({
    limit: 100,
    active: true,
  })) {
    const features = await fetchProductFeatures(stripe, product.id);
    const prices = await fetchProductPrices(stripe, product.id);

    products.push({
      id: product.id,
      name: product.name,
      description: product.description,
      active: product.active,
      metadata: product.metadata,
      marketing_features: product.marketing_features,
      features: features,
      prices: prices,
      default_price: product.default_price,
      created: product.created,
      updated: product.updated,
      images: product.images,
      type: product.type,
      unit_label: product.unit_label,
    });
  }
  return products;
}

async function fetchAllCoupons(stripe) {
  const coupons = [];
  for await (const coupon of stripe.coupons.list({ limit: 100 })) {
    coupons.push({
      id: coupon.id,
      name: coupon.name,
      percent_off: coupon.percent_off,
      amount_off: coupon.amount_off,
      duration: coupon.duration,
      duration_in_months: coupon.duration_in_months,
      valid: coupon.valid,
      metadata: coupon.metadata,
    });
  }
  return coupons;
}

async function fetchAllMeters(stripe) {
  const meters = [];
  try {
    for await (const meter of stripe.billing.meters.list({ limit: 100 })) {
      meters.push({
        id: meter.id,
        display_name: meter.display_name,
        event_name: meter.event_name,
        default_aggregation: meter.default_aggregation,
        status: meter.status,
        created: meter.created,
        updated: meter.updated,
        customer_mapping: meter.customer_mapping,
        event_time_window: meter.event_time_window,
        value_settings: meter.value_settings,
        livemode: meter.livemode,
      });
    }
  } catch (error) {
    console.warn("Error fetching meters:", error.message);
  }
  return meters;
}

async function fetchAllFeatures(stripe) {
  const features = [];
  try {
    for await (const feature of stripe.entitlements.features.list({
      limit: 100,
    })) {
      features.push({
        id: feature.id,
        name: feature.name,
        active: feature.active,
        lookup_key: feature.lookup_key,
        metadata: feature.metadata,
        livemode: feature.livemode,
      });
    }
  } catch (error) {
    console.warn("Error fetching features:", error.message);
  }
  return features;
}

function generateCode(name) {
  return name.replace(/[^a-zA-Z0-9]+/g, "_");
}

function featureCodeForMeter(stripeData, meterId) {
  const meter = stripeData.meters.find((m) => m.id === meterId);
  return meter ? meter.event_name : null;
}

function centsToDecimal(amount, amountDecimal) {
  if (!amount && !amountDecimal) return null;
  const value = amountDecimal || amount;
  return (Number(value) / 100).toFixed(2);
}

function countDecimals(amount) {
  if (!amount) return 0;
  const str = amount.toString();
  const decimalPart = str.split(".")[1];
  return decimalPart ? decimalPart.length : 0;
}

async function transformToImportFormat(stripeData, destinationClient) {
  // Fetch the first platform
  const platforms = await platformsQuery(destinationClient);
  if (!platforms || platforms.length === 0) {
    throw new Error("No platforms found in Bunny instance");
  }
  const platformId = platforms[0].id;

  const DEFAULT_UNIT_FEATURE_CODE = "unit";

  const mainProduct = {
    name: "Imported from Stripe",
    features: [],
    plans: [],
    platformId: platformId,
  };

  // Add features
  stripeData.features.forEach((feature) => {
    mainProduct.features.push({
      name: feature.name,
      code: feature.lookup_key,
      is_unit: false,
      kind: "boolean",
      is_provisioned: true,
      description: null,
      position: 1,
      is_visible: true,
    });
  });

  // Add usage-based features from meters
  stripeData.meters.forEach((meter) => {
    mainProduct.features.push({
      name: meter.display_name,
      code: meter.event_name,
      is_unit: true,
      kind: "quantity",
      is_provisioned: true,
      description: null,
      position: 1,
      is_visible: true,
    });
  });

  // Add default Unit feature
  mainProduct.features.push({
    name: "Unit",
    code: DEFAULT_UNIT_FEATURE_CODE,
    is_unit: true,
    kind: "quantity",
    is_provisioned: true,
    description: null,
    position: 1,
    is_visible: true,
  });

  // Process products into plans
  stripeData.products.forEach((product) => {
    if (!product.active) return;

    const plan = {
      code: product.id,
      name: product.name,
      available: true,
      description: product.description,
      internal_notes: null,
      available_from: "2024-01-01",
      available_to: "2044-01-01",
      is_visible: true,
      include_features_from_plan_id: null,
      addon: false,
      self_service_cancel: true,
      self_service_buy: true,
      self_service_renew: true,
      position: 0,
      pricing_description: null,
      pricing_style: "priced",
      contact_us_label: null,
      contact_us_url: null,
      price_lists: [],
    };

    // Process prices into price lists
    product.prices.forEach((price) => {
      if (!price.active) return;

      let billingPeriod;
      if (price.recurring) {
        switch (price.recurring.interval) {
          case "month":
            switch (price.recurring.interval_count) {
              case 1:
                billingPeriod = "monthly";
                break;
              case 3:
                billingPeriod = "quarterly";
                break;
              case 6:
                billingPeriod = "semi_annual";
                break;
              case 12:
                billingPeriod = "annual";
                break;
              default:
                return; // Skip unsupported billing periods
            }
            break;
          case "year":
            billingPeriod = "annual";
            break;
          default:
            console.warn(
              `Skipping price for product '${product.name}' - Unsupported billing period`
            );
            return;
        }
      }

      const chargeType =
        price.type === "recurring"
          ? price.is_metered
            ? "usage"
            : "recurring"
          : "one_time";

      let pricingModel;
      switch (price.billing_scheme) {
        case "per_unit":
          pricingModel = "volume";
          break;
        case "tiered":
          pricingModel = price.tiers_mode === "graduated" ? "tiered" : "volume";
          break;
        case "flat":
          pricingModel = "flat";
          break;
        default:
          console.warn(
            `Skipping price for product '${product.name}' - Unsupported billing scheme`
          );
          return;
      }

      if (pricingModel === "volume" && chargeType === "one_time") {
        console.warn(
          `Skipping price for product '${product.name}' - One time charges not supported for volume plans`
        );
        return;
      }

      const featureCode =
        price.is_metered && price.metering?.meter
          ? featureCodeForMeter(stripeData, price.metering.meter)
          : DEFAULT_UNIT_FEATURE_CODE;

      const priceList = {
        code: price.id,
        name: `${product.name} ${price.nickname || "Default"}`,
        price_description: null,
        is_visible: price.active,
        currency_id: price.currency.toUpperCase(),
        trial_allowed: price.type !== "one_time",
        trial_length_days: price.recurring?.trial_period_days || 30,
        trial_expiration_action: "activate",
        sku: null,
        price_list_charges: [],
      };

      const charge = {
        code: generateCode(`${price.id}_charge`),
        name: price.nickname || product.name,
        accounting_code: null,
        tax_code: null,
        price_description: null,
        specific_invoice_line_text: null,
        feature_id: null,
        feature_code: featureCode,
        quantity_min: 1,
        quantity_max: null,
        default_quantity: 1,
        usage_calculation_type: price.is_metered ? "sum" : null,
        self_service_quantity: false,
        recognition_period: null,
        price_list_charge_tiers: [],
        billing_period: billingPeriod,
        charge_type: chargeType,
        pricing_model: pricingModel,
        price_decimals: 0,
      };

      if (
        pricingModel === "volume" &&
        price.transform_quantity?.round === "up"
      ) {
        if (price.is_metered) {
          charge.round_up_interval = price.transform_quantity.divide_by;
        } else {
          console.warn(
            `Skipping price for product '${product.name}' - Round up not supported for recurring charges`
          );
          return;
        }
      }

      let priceDecimals = 0;

      if (pricingModel === "volume" && !price.tiers) {
        const unitPrice = centsToDecimal(
          price.unit_amount,
          price.unit_amount_decimal
        );
        priceDecimals = countDecimals(unitPrice);
        charge.price_list_charge_tiers.push({
          starts: 1,
          ends: 999999999,
          price: unitPrice,
        });
      }

      if (["tiered", "volume"].includes(pricingModel) && price.tiers) {
        price.tiers.forEach((tier, index) => {
          const tierPrice = centsToDecimal(
            tier.unit_amount,
            tier.unit_amount_decimal
          );
          priceDecimals = Math.max(priceDecimals, countDecimals(tierPrice));
          charge.price_list_charge_tiers.push({
            starts: index === 0 ? 1 : price.tiers[index - 1].up_to + 1,
            ends: tier.up_to || 999999999,
            price: tierPrice,
          });
        });
      } else {
        charge.price = centsToDecimal(
          price.unit_amount,
          price.unit_amount_decimal
        );
      }

      charge.price_decimals = priceDecimals === 1 ? 2 : priceDecimals;

      priceList.price_list_charges.push(charge);
      plan.price_lists.push(priceList);
    });

    mainProduct.plans.push(plan);
  });

  return { products: [mainProduct] };
}

const migrateStripeProducts = new Command("products")
  .description("Migrate products from Stripe to Bunny")
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
        products: await fetchAllProducts(stripe),
        coupons: await fetchAllCoupons(stripe),
        meters: await fetchAllMeters(stripe),
        features: await fetchAllFeatures(stripe),
        exported_at: new Date().toISOString(),
      };

      const stripeDataPath = path.join(tempDir, "stripe_products.json");
      await fs.writeFile(stripeDataPath, JSON.stringify(stripeData, null, 2));
      spinner.succeed("Stripe data fetched and saved");

      // Create the destination client
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

      // Transform data to Bunny format
      spinner = ora("Transforming data to Bunny format").start();
      const bunnyData = await transformToImportFormat(
        stripeData,
        destinationClient
      );
      const bunnyDataPath = path.join(tempDir, "bunny_products.json");
      await fs.writeFile(bunnyDataPath, JSON.stringify(bunnyData, null, 2));
      spinner.succeed("Data transformed to Bunny format");

      // Only show detailed import info in verbose mode
      if (options.verbose) {
        console.log(chalk.blue("\nAttempting to import the following data:"));
        console.log(chalk.gray("Profile:", options.profile));
        console.log(chalk.gray("File path:", bunnyDataPath));
        console.log(
          chalk.gray("Products to import:", bunnyData.products.length)
        );
      }

      // Import using the products command
      try {
        // Get confirmation before import
        const confirmed = await confirm({
          message: "Are you sure you want to do this?",
        });

        if (!confirmed) {
          console.log(chalk.red("Ok, import canceled"));
          return;
        }

        // Create a new spinner for the import
        spinner = ora("Importing products").start();

        // Execute the import directly using the productImport mutation
        const products = JSON.parse(await fs.readFile(bunnyDataPath, "utf8"));

        try {
          const importResults = await productImport(
            destinationClient,
            products,
            { verbose: options.verbose }
          );

          if (importResults?.status === "success") {
            spinner.succeed("Products imported successfully");
          } else {
            spinner.fail("Failed to import products");
            // Log the full import results for debugging
            if (options.verbose) {
              console.log(chalk.yellow("\nImport Results:"));
              console.log(chalk.gray(JSON.stringify(importResults, null, 2)));
            }
            throw new Error(`Import failed: ${JSON.stringify(importResults)}`);
          }
        } catch (importError) {
          spinner.fail("Import failed");
          const errorMessage =
            importError?.response?.errors?.[0]?.message ||
            importError?.message ||
            "Unknown error during product import";

          if (options.verbose) {
            console.log(chalk.yellow("\nError Details:"));
            console.log(chalk.gray("Message:", errorMessage));
            if (importError.response) {
              console.log(
                chalk.gray(
                  "Response:",
                  JSON.stringify(importError.response, null, 2)
                )
              );
            }
            if (importError.stack) {
              console.log(chalk.yellow("\nStack trace:"));
              console.log(chalk.gray(importError.stack));
            }
          }

          throw new Error(errorMessage);
        }
      } catch (importError) {
        spinner.fail("Error during import");
        const errorMessage =
          importError?.message || "Unknown error occurred during import";
        console.error(chalk.red("\nError:", errorMessage));

        // Keep the temp files if there was an error or in verbose mode
        if (tempDir && (options.verbose || importError)) {
          console.log(chalk.yellow("\nDebug files preserved at:", tempDir));
          console.log(chalk.yellow("Files:"));
          console.log(
            chalk.yellow(
              "- Stripe data:",
              path.join(tempDir, "stripe_products.json")
            )
          );
          console.log(
            chalk.yellow(
              "- Bunny data:",
              path.join(tempDir, "bunny_products.json")
            )
          );

          if (options.verbose && importError.stack) {
            console.log(chalk.yellow("\nStack trace:"));
            console.log(chalk.gray(importError.stack));
          }
        }

        process.exit(1);
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
            path.join(tempDir, "stripe_products.json")
          )
        );
        console.log(
          chalk.yellow(
            "- Bunny data:",
            path.join(tempDir, "bunny_products.json")
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

export default migrateStripeProducts;

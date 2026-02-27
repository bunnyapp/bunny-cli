import { Command } from "commander";
import { confirm, input, select } from "@inquirer/prompts";
import ora from "ora";
import chalk from "chalk";
import Conf from "conf";
import client from "../../lib/client.js";
import productsQuery from "../../lib/queries/products.js";
import productQuery from "../../lib/queries/product.js";
import productImport from "../../lib/mutations/product-import.js";
import platformsQuery from "../../lib/queries/platforms.js";

const config = new Conf({ projectName: "bunny-cli" });

function formatBaseUrl(subdomain) {
  // Remove protocol if present
  let url = subdomain.replace(/^https?:\/\//, "");
  // Remove trailing slash
  url = url.replace(/\/$/, "");
  // Add protocol if not present
  if (!url.startsWith("http")) {
    url = `https://${url}`;
  }
  return url;
}

function transformToImportFormat(productData, destinationClient) {
  // Transform the GraphQL product response to the import format
  const transformedProduct = {
    name: productData.name,
    description: productData.description || null,
    internal_notes: productData.internalNotes || null,
    platformId: productData.platformId,
    product_category_id: productData.productCategoryId || null,
    show_product_name_on_line_item:
      productData.showProductNameOnLineItem || false,
    everything_in_plus: productData.everythingInPlus || false,
    features: [],
    plans: [],
  };

  // Transform features
  if (productData.features && Array.isArray(productData.features)) {
    transformedProduct.features = productData.features.map((feature) => ({
      id: feature.id,
      name: feature.name,
      code: feature.code,
      description: feature.description || null,
      is_unit: feature.isUnit || false,
      kind: feature.isUnit ? "quantity" : "boolean",
      is_provisioned: feature.isProvisioned || false,
      is_visible: feature.isVisible,
      position: feature.position || 0,
      unit_name: feature.unitName || null,
    }));
  }

  // Transform plans
  if (productData.plans && Array.isArray(productData.plans)) {
    transformedProduct.plans = productData.plans.map((plan) => {
      const transformedPlan = {
        code: plan.code,
        name: plan.name,
        description: plan.description || null,
        internal_notes: plan.internalNotes || null,
        available: plan.isAvailableNow,
        available_from: plan.availableFrom || null,
        available_to: plan.availableTo || null,
        is_visible: plan.isVisible,
        include_features_from_plan_id: null,
        addon: plan.addon || false,
        self_service_cancel: plan.selfServiceCancel,
        self_service_buy: plan.selfServiceBuy,
        self_service_renew: plan.selfServiceRenew,
        position: plan.position || 0,
        pricing_description: plan.pricingDescription || null,
        pricing_style: "priced",
        contact_us_label: plan.contactUsLabel || null,
        contact_us_url: plan.contactUsUrl || null,
        price_lists: [],
      };

      // Transform price lists
      if (plan.priceLists && Array.isArray(plan.priceLists)) {
        transformedPlan.price_lists = plan.priceLists.map((priceList) => {
          const transformedPriceList = {
            code: priceList.code,
            name: priceList.name,
            price_description: priceList.priceDescription || null,
            is_visible: priceList.isVisible,
            currency_id: priceList.currencyId,
            trial_allowed: priceList.trialAllowed || false,
            trial_length_days: priceList.trialLengthDays || null,
            trial_expiration_action: priceList.trialExpirationAction || null,
            sku: priceList.sku || null,
            price_list_charges: [],
          };

          // Transform charges
          if (priceList.charges && Array.isArray(priceList.charges)) {
            transformedPriceList.price_list_charges = priceList.charges.map(
              (charge) => {
                const transformedCharge = {
                  code: charge.code,
                  name: charge.name,
                  accounting_code: charge.accountingCode || null,
                  tax_code: charge.taxCode || null,
                  price_description: charge.priceDescription || null,
                  specific_invoice_line_text:
                    charge.specificInvoiceLineText || null,
                  feature_id: charge.featureId || null,
                  feature_code: charge.feature?.code || null,
                  billing_period: charge.billingPeriod?.toLowerCase() || null,
                  charge_type: charge.chargeType?.toLowerCase() || null,
                  pricing_model: charge.pricingModel?.toLowerCase() || null,
                  usage_calculation_type:
                    charge.usageCalculationType?.toLowerCase() || null,
                  quantity_min: charge.quantityMin || 1,
                  quantity_max: charge.quantityMax || null,
                  default_quantity: 1,
                  self_service_quantity: charge.selfServiceQuantity || false,
                  recognition_period: charge.recognitionPeriod || null,
                  price_list_charge_tiers: [],
                  price_decimals: charge.priceDecimals || 0,
                  feature_addon: charge.featureAddon,
                };

                // Determine billing period from periodMonths
                if (priceList.periodMonths) {
                  switch (priceList.periodMonths) {
                    case 1:
                      transformedCharge.billing_period = "monthly";
                      break;
                    case 3:
                      transformedCharge.billing_period = "quarterly";
                      break;
                    case 6:
                      transformedCharge.billing_period = "semi_annual";
                      break;
                    case 12:
                      transformedCharge.billing_period = "annual";
                      break;
                  }
                }

                // Determine charge type and pricing model from price
                // Check if there are tiers first (volume pricing)
                if (
                  charge.priceListChargeTiers &&
                  charge.priceListChargeTiers.length > 0
                ) {
                  transformedCharge.price_list_charge_tiers =
                    charge.priceListChargeTiers.map((tier, index) => ({
                      starts: tier.starts || (index === 0 ? 1 : null),
                      ends:
                        index < charge.priceListChargeTiers.length - 1
                          ? charge.priceListChargeTiers[index + 1].starts - 1
                          : 999999999,
                      price: tier.price,
                    }));
                }

                // Handle round up interval
                if (charge.roundUpInterval) {
                  transformedCharge.round_up_interval = charge.roundUpInterval;
                }

                return transformedCharge;
              },
            );
          }

          return transformedPriceList;
        });
      }

      return transformedPlan;
    });
  }

  return { products: [transformedProduct] };
}

const migrateBunny = new Command("bunny")
  .description("Migrate products from one Bunny instance to another")
  .option("-v, --verbose", "Show verbose output")
  .action(async (options) => {
    let spinner;

    try {
      // Step 1: Get source instance credentials
      console.log(chalk.blue("\n📥 Source Instance Configuration"));
      const sourceSubdomain = await input({
        message: "Enter source Bunny instance subdomain or URL:",
        validate: (value) => (value.trim() ? true : "Subdomain is required"),
      });

      const sourceClientId = await input({
        message: "Enter source instance client ID:",
        validate: (value) => (value.trim() ? true : "Client ID is required"),
      });

      const sourceClientSecret = await input({
        message: "Enter source instance client secret:",
        validate: (value) =>
          value.trim() ? true : "Client secret is required",
      });

      const sourceBaseUrl = formatBaseUrl(sourceSubdomain);
      const sourceClient = client(
        sourceBaseUrl,
        sourceClientId,
        sourceClientSecret,
      );

      // Step 2: List products from source
      spinner = ora("Fetching products from source instance").start();
      let products;
      try {
        console.log("Fetching products from source instance");
        products = await productsQuery(sourceClient);
      } catch (error) {
        spinner.fail("Error fetching products");
        throw error;
      }

      if (!products || !Array.isArray(products)) {
        spinner.fail("Invalid response from products query");
        throw new Error("Products query returned invalid data");
      }

      spinner.succeed(`Found ${products.length} products`);

      if (!products || products.length === 0) {
        console.error(chalk.red("No products found in source instance"));
        process.exit(1);
      }

      // Step 3: Let user select a product
      const selectedProduct = await select({
        message: "Select a product to migrate:",
        choices: products.map((product) => ({
          name: `${product.name} (${product.code})`,
          value: product,
        })),
      });

      // Step 4: Get destination instance credentials
      console.log(chalk.blue("\n📤 Destination Instance Configuration"));
      const destSubdomain = await input({
        message: "Enter destination Bunny instance subdomain or URL:",
        validate: (value) => (value.trim() ? true : "Subdomain is required"),
      });

      const destClientId = await input({
        message: "Enter destination instance client ID:",
        validate: (value) => (value.trim() ? true : "Client ID is required"),
      });

      const destClientSecret = await input({
        message: "Enter destination instance client secret:",
        validate: (value) =>
          value.trim() ? true : "Client secret is required",
      });

      const destBaseUrl = formatBaseUrl(destSubdomain);
      const destClient = client(destBaseUrl, destClientId, destClientSecret);

      // Step 5: Fetch full product data from source
      spinner = ora(
        `Fetching product '${selectedProduct.name}' from source instance`,
      ).start();
      const productData = await productQuery(sourceClient, {
        id: selectedProduct.id,
      });

      if (!productData) {
        spinner.fail("Failed to fetch product data");
        throw new Error("Product not found or could not be retrieved");
      }

      spinner.succeed("Product data fetched");

      // Step 6: Get platform ID from destination (needed for import)
      spinner = ora("Fetching platforms from destination instance").start();
      const platforms = await platformsQuery(destClient);
      if (!platforms || platforms.length === 0) {
        spinner.fail("No platforms found");
        throw new Error("No platforms found in destination instance");
      }
      spinner.succeed(`Found ${platforms.length} platform(s)`);

      // Step 7: Transform data to import format
      spinner = ora("Transforming product data to import format").start();

      // Set platform ID from destination if not present in source product
      if (!productData.platformId && platforms.length > 0) {
        productData.platformId = platforms[0].id;
      }

      const importData = transformToImportFormat(productData, destClient);

      if (options.verbose) {
        console.log(chalk.blue("\nTransformed import data:"));
        console.log(chalk.gray(JSON.stringify(importData, null, 2)));
      }

      spinner.succeed("Product data transformed");

      // Step 8: Confirm and import
      const confirmed = await confirm({
        message: `Are you sure you want to import product '${selectedProduct.name}' to the destination instance?`,
      });

      if (!confirmed) {
        console.log(chalk.yellow("Import canceled"));
        return;
      }

      spinner = ora("Importing product to destination instance").start();

      const importResults = await productImport(destClient, importData, {
        verbose: options.verbose,
      });

      if (importResults?.status === "success") {
        spinner.succeed("Product imported successfully");
      } else {
        spinner.fail("Failed to import product");
        if (options.verbose) {
          console.log(chalk.yellow("\nImport Results:"));
          console.log(chalk.gray(JSON.stringify(importResults, null, 2)));
        }
        throw new Error(`Import failed: ${JSON.stringify(importResults)}`);
      }
    } catch (error) {
      if (spinner) {
        spinner.fail("Migration failed");
      }
      const errorMessage =
        error?.message || "Unknown error occurred during migration";
      console.error(chalk.red("\nError:"), errorMessage);

      if (options.verbose && error.stack) {
        console.log(chalk.yellow("\nStack trace:"));
        console.log(chalk.gray(error.stack));
      }

      process.exit(1);
    }
  });

export default migrateBunny;

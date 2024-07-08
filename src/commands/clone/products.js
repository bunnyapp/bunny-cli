import { Command } from "commander";
import inquirer from "inquirer";
import { input, select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import client from "../../lib/client.js";
import productsQuery from "../../lib/queries/products.js";
import productCreate from "../../lib/mutations/product-create.js";

const products = new Command("products")
  .description("Clone products from one Bunny instance to another")
  .action(async () => {
    const sourceSubdomain = await input({
      message: "Enter a subdomain for the source Bunny instance",
    });
    const sourceAccessToken = await input({
      message: "Enter an access token for the source Bunny instance",
    });

    const sourceClient = client(sourceSubdomain, sourceAccessToken);

    const products = await productsQuery(sourceClient);

    const targetProductId = await select({
      message: "Select a product to clone",
      choices: products.map((product) => ({
        value: product.id,
        name: product.name,
      })),
    });

    const targetProduct = products.find(
      (product) => product.id === targetProductId
    );

    const destinationSubdomain = await input({
      message: "Enter a subdomain for the destination Bunny instance",
    });
    const destinationAccessToken = await input({
      message: "Enter an access token for the destination Bunny instance",
    });

    const destinationClient = client(
      destinationSubdomain,
      destinationAccessToken
    );

    const confirmed = await confirm({
      message: "Are you sure you want to do this?",
    });

    if (!confirmed) {
      console.log(chalk.red("Ok, not cloning the product"));
      return;
    } else {
      console.log(chalk.green("Cloning started..."));

      const clonedProduct = await productCreate(
        destinationClient,
        targetProduct
      );

      console.log("Cloned product", clonedProduct);
    }
  });

export default products;

// const bunny = new BunnyClient({
//   baseUrl: "https://bunny.bunny.internal",
//   accessToken:
//     "eyJraWQiOiJxUzJqMlYzakwyYTZYMkVTTzd1THRLYVBackZfdF95ckhKRDgwdFpEVW9jIiwiYWxnIjoiSFM1MTIifQ.eyJpc3MiOiJNaWdyYXRpb24gQ2xpZW50IiwiaWF0IjoxNzIwNDU1NzA4LCJqdGkiOiIwNjU3N2IyNS01ZjUwLTRjYWEtOWE3Ny1iYjhlMTViMTE2MTQiLCJjbGllbnRfaWQiOiJxUzJqMlYzakwyYTZYMkVTTzd1THRLYVBackZfdF95ckhKRDgwdFpEVW9jIiwiYXVkIjoiaHR0cHM6Ly9idW5ueS5pbnRlcm5hbCIsImV4cCI6MTcyMDQ2MjkwOCwic2NvcGUiOiJzZWN1cml0eTpyZWFkIHNlY3VyaXR5OndyaXRlIGFkbWluOnJlYWQgYWRtaW46d3JpdGUgb3duZXI6cmVhZCBvd25lcjp3cml0ZSBzdGFuZGFyZDpyZWFkIHN0YW5kYXJkOndyaXRlIHF1b3Rpbmc6cmVhZCBxdW90aW5nOndyaXRlIHByb2R1Y3Q6cmVhZCBwcm9kdWN0OndyaXRlIHdvcmtmbG93OnJlYWQgd29ya2Zsb3c6d3JpdGUgZGV2ZWxvcGVyOnJlYWQgZGV2ZWxvcGVyOndyaXRlIG9wZW5pZCBiaWxsaW5nOnJlYWQgYmlsbGluZzp3cml0ZSBhbmFseXRpY3M6cmVhZCBhbmFseXRpY3M6d3JpdGUgbGVnZW5kYXJ5OnJlYWQgbGVnZW5kYXJ5OndyaXRlIHBsYXRmb3JtOnJlYWQgcGxhdGZvcm06d3JpdGUgcG9ydGFsOndyaXRlIHBvcnRhbDpyZWFkIiwic3ViIjoiYzYxMGQ5MWEtZDBkNS00NDEyLWJlMTYtZDM1ZDI2NWY5NGFkIiwic3ViX3R5cGUiOiJVc2VyIiwiYWN0b3JfZGlzcGxheV9hcyI6eyJpZCI6MTMsInR5cGUiOiJBcGlDbGllbnQifX0.6KmeIk2oXOTsL6RIHrUacsOzGeut1Afq_hI09QdZYm3BzVQCLyWt7eKUhCQVWuNSgyIVXYKEwWb4brf7Qd8Kfw",
// });

// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import chalk from "chalk";

const mutation = `mutation productImport ($attributes: JSON!) {
  productImport (attributes: $attributes) {
      response
      errors
  }
}`;

const productImport = async (client, attributes, options) => {
  try {
    const res = await client.query(mutation, { attributes: attributes });

    if (res?.errors) {
      throw new Error(res.errors.map((e) => e.message).join());
    }

    const productImport = res?.data?.productImport;
    if (!productImport) {
      throw new Error("Invalid response from server");
    }

    if (productImport?.errors) {
      if (Array.isArray(productImport.errors)) {
        throw new Error(productImport.errors.join());
      } else {
        throw new Error(productImport.errors);
      }
    }

    if (options?.verbose) {
      console.log(chalk.gray("\nAPI Response:"), JSON.stringify(res, null, 2));
    }

    return productImport.response;
  } catch (error) {
    console.log(chalk.red("\nProduct Import Error"));
    let errorMessage = "Unknown error during product import";

    if (error?.status === 500) {
      errorMessage = `Internal Server Error: ${
        error.exception || "unknown server error"
      }`;
      console.log(chalk.red("Server Error Details:"), error);
    } else if (error?.message) {
      errorMessage = error.message;
    } else if (typeof error === "string") {
      errorMessage = error;
    } else if (error) {
      console.log(chalk.red("Raw Error:"), error);
      errorMessage = JSON.stringify(error);
    }

    throw new Error(errorMessage);
  }
};

export default productImport;

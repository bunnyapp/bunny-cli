import chalk from "chalk";

const mutation = `mutation productImport ($attributes: JSON!) {
  productImport (attributes: $attributes) {
      response
      errors
  }
}`;

const productImport = async (client, attributes) => {
  try {
    const res = await client.query(mutation, { attributes: attributes });

    const productImport = res?.data?.productImport;

    if (res?.errors) {
      throw new Error(res.errors.map((e) => e.message).join());
    }

    if (productImport?.errors) {
      throw new Error(productImport.errors.join());
    }

    if (productImport?.response.status === "failed") {
      throw new Error(productImport.response.message);
    }

    return productImport.response;
  } catch (error) {
    console.log(chalk.red(error));
  }
};

export default productImport;
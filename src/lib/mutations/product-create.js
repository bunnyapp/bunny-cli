import chalk from "chalk";

const mutation = `mutation productCreate ($attributes: ProductAttributes!) {
  productCreate (attributes: $attributes) {
      errors
      product {
        code
        description
        everythingInPlus
        id
        internalNotes
        name
        platformId
        productCategoryId
        showProductNameOnLineItem
      }
  }
}`;

const productCreate = async (client, attributes) => {
  const attributesToRemove = ["id", "platformId", "productCategoryId"];
  attributesToRemove.forEach((attr) => delete attributes[attr]);

  try {
    const response = await client.query(mutation, {
      attributes: attributes,
    });
    return response.data.productCreate.product;
  } catch (error) {
    console.log(chalk.red("Error creating product.", error));
  }
};

export default productCreate;

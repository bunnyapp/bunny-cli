import chalk from "chalk";

const productCreate = async (client, attributes) => {
  const attributesToRemove = ["id", "platformId", "productCategoryId"];
  attributesToRemove.forEach((attr) => delete attributes[attr]);

  try {
    return await client.productCreate(attributes);
  } catch (error) {
    console.log(chalk.red("Error creating product.", error));
  }
};

export default productCreate;

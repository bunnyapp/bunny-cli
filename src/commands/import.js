import { Command } from "commander";
import products from "./import/products.js";
import subscriptions from "./import/subscriptions.js";

const importer = new Command("import").description(
  "Bulk import products, plans, and price lists"
);

importer.addCommand(products);
importer.addCommand(subscriptions);

export default importer;

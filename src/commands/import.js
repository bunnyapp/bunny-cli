import { Command } from "commander";
import products from "./import/products.js";
import subscriptions from "./import/subscriptions.js";
import mrr from "./import/mrr.js";
import invoices from "./import/invoices.js";

const importer = new Command("import").description(
  "Bulk import products, plans, and price lists & historical MRR data"
);

importer.addCommand(products);
importer.addCommand(subscriptions);
importer.addCommand(mrr);
importer.addCommand(invoices);

export default importer;

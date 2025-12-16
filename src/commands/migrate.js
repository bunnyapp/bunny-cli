import { Command } from "commander";
import stripe from "./migrate/stripe/index.js";
import bunny from "./migrate/bunny.js";

const migrator = new Command("migrate").description(
  "Migrate data from external sources"
);

migrator.addCommand(stripe);
migrator.addCommand(bunny);

export default migrator;

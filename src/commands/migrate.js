import { Command } from "commander";
import stripe from "./migrate/stripe/index.js";

const migrator = new Command("migrate").description(
  "Migrate data from external sources"
);

migrator.addCommand(stripe);

export default migrator;

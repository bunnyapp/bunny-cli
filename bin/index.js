#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import figlet from "figlet";
import Conf from "conf";

import clone from "../src/commands/clone.js";
import importer from "../src/commands/import.js";

const program = new Command();

program
  .name("bunny")
  .description("Utility for managing Bunny")
  .version("1.0.0")
  .option("--unsafe", "Ignores SSL certificate errors");

program.addCommand(clone);
program.addCommand(importer);

if (process.argv.length <= 2) {
  const info = chalk.hex("#FF5833");
  console.log(info(figlet.textSync("Bunny", { horizontalLayout: "full" })));
}

if (process.argv.includes("--unsafe")) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

program.parse(process.argv);

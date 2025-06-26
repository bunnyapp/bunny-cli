import { Command } from "commander";
import inspectProfile from "./inspect.js";

const profiles = new Command("profiles")
  .description("Manage Bunny CLI profiles")
  .addCommand(inspectProfile);

export default profiles;

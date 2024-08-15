import { Command } from "commander";
import product from "./clone/product.js";

const clone = new Command("clone").description(
  "Clone items between Bunny instances"
);

clone.addCommand(product);

export default clone;

import { Command } from "commander";
import products from "./clone/products.js";

const clone = new Command("clone").description(
  "Clone items between Bunny instances"
);

clone.addCommand(products);

export default clone;

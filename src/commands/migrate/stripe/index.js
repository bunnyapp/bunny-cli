import { Command } from "commander";
import products from "./products.js";
import subscriptions from "./subscriptions.js";

const stripe = new Command("stripe").description("Migrate data from Stripe");

stripe.addCommand(products);
stripe.addCommand(subscriptions);

export default stripe;
